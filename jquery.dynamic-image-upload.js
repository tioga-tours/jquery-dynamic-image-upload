/*!
 * jQuery Dynamic Image Upload library
 * https://tech.tiogatours.nl/jquery-dynamic-image-upload/README.md
 *
 * Copyright Tioga Tours B.V.
 * Released under the MIT license
 * https://tech.tiogatours.nl/jquery-dynamic-image-upload/LICENSE
 *
 * Date: 2016-04-26
 */
;(function ($, undef) {

    var DynamicImageUpload = function (dropContainer, options) {
        var self = this;

        self.dropContainer = $(dropContainer);
        self.fileField = self.dropContainer.find('[type=file]');

        if (self.fileField === undef || self.fileField.length === 0) {
            throw 'Could not find the file field inside the drop container';
        }

        $.extend(true, self.options, options);
        self.uploadSize = self.options.defaultUploadSize;
        self.speedTest();
        self.initEvents();
    };

    DynamicImageUpload.prototype = {
        dropContainer: null,
        fileField: null,
        uploadSize: null,
        options: {
            previewSize: [200, 200],
            defaultUploadSize: 2000000,

            // Define the number of seconds of uploading allowed per image,
            // this way the optimum resolution can be determined using
            // the speed test
            targetUploadTime: 10,

            // Define the upload sizes, can be
            // an array [width,height]
            // or an integer with total number of pixels
            // Should be defined from high res to low res
            uploadSizes: [
                5000000, // Five megapixels
                [2000, 2000], // Four megapixels or max width/height, will scale till whole image fits in this box
                [1000, 1000]
            ],

            // Run speedTest to determine upload size
            // pass in all the options as you would pass them to the speedtest
            speedTest: {
                upload: {
                    url: 'speedtest.php'
                }
            },

            // Number of workers
            // to concurrently resize and upload
            workers: 2,

            // CSS Class to add to the image-container
            //  every container in the target box has a div container which
            //  is usable for any purpose
            imgContainerClass: 'img-container',

            // Get these tags from the image
            // store it in $(img).data('exif')
            // requires exif.js (https://github.com/exif-js/exif-js)
            extractExif: ['Make', 'Model', 'Orientation'],

            // For debugging (-1 = disabled, 0 = errors, 5 = debug)
            verboseLevel: -1,

            // Pass settings to $.ajax, data.src, data.name and data.exif will be set by the upload method
            ajaxUpload: {
                url: 'upload.php',
                method: 'POST',
                dataType: 'json',
                data: {}
            }
        },

        // The actual workers
        workers: [],

        verbose: function (msg, level) {
            if (level <= this.options.verboseLevel) {
                console.log(msg);
            }
        },

        speedTest: function () {
            var self = this;
            if (self.options.speedTest === false) {
                self.uploadSize = self.options.uploadSizes[0];
                return;
            }
            if (typeof SpeedTest === 'undefined') {
                self.verbose('SpeedTest library is not included', 1);
                return;
            }

            var speedTest = new SpeedTest(self.options.speedTest);
            speedTest.benchUpload().then(function (speed) {
                self.verbose('Uploadspeed ' + Math.round(speed / 1024) + ' KB/s', 5);

                var targetSize = speed * self.options.targetUploadTime,
                    i,
                    resolution,
                    usizes = self.options.uploadSizes;

                for (i = 0; i < usizes.length; i++) {
                    if (typeof usizes[i] !== 'number') {
                        resolution = usizes[i][0] * usizes[i][1];
                    } else {
                        resolution = usizes[i];
                    }

                    if (resolution * 4 < targetSize || i === usizes.length - 1) {
                        self.verbose('Setting resolution to ' + resolution + ' pixels', 5);
                        self.setImageSize(usizes[i]);
                        break;
                    }
                }

            });
        },

        /**
         * Set the size of the image (number = megapixel, array = [width,height])
         * @param size
         */
        setImageSize: function (size) {
            this.uploadSize = size;
            $(this).trigger('upload-size-change', [size]);
        },

        initEvents: function () {
            var self = this;
            self.dropContainer.on({
                click: function () {
                    self.fileField.trigger('click');
                },
                dragover: function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                },
                dragenter: function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.dropContainer.addClass('drag-hover');
                },
                dragleave: function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.dropContainer.removeClass('drag-hover');
                },
                drop: function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.dropContainer.removeClass('drag-hover');
                    self.addFiles(e.originalEvent.dataTransfer.files);
                }
            });

            self.fileField.on({
                change: function (e) {
                    self.addFiles(this.files);
                    self.fileField.val(self.fileField[0].defaultValue)
                },
                click: function (e) {
                    e.stopPropagation();
                }
            });
        },

        /**
         * Add files to the drop box
         */
        addFiles: function (files) {
            var i = 0,
                self = this,
                files = $.extend(true, {}, files),

                addFile = function (file) {
                    if (!file) {
                        return;
                    }

                    self.addFile(file).then(function () {
                        i++;
                        addFile(files[i]);
                    });
                };

            addFile(files[i]);
        },

        addFile: function (file) {
            var self = this,
                deferred = $.Deferred(),
                img = $(new Image()),
                imgContainer = $('<div class="' + self.options.imgContainerClass + '"></div>');

            $(self).trigger('image-add', [img]);

            img.data('file', file);
            self.dropContainer.append(imgContainer);
            imgContainer.append(img);

            if (file.type.match(/image.*/)) {
                self.extractEXIFData(file, img).then(function (exifData) {
                    file.exifData = exifData;
                    self.loadPreview(file, img).then(function (imgStr) {
                        $(self).trigger('image-added', [img]);
                        deferred.resolve(exifData, imgStr);
                    });
                });
            } else {
                deferred.reject();
            }

            return deferred.promise();
        },

        loadPreview: function (file, img) {
            var self = this,
                deferred = $.Deferred();

            self.resizeImage(file, self.options.previewSize).then(function (dataUrl) {
                img[0].src = dataUrl;
                deferred.resolve(dataUrl);
            });

            return deferred.promise();
        },

        resizeImage: function (file, toSize, highQuality) {
            var self = this,
                scale,
                width,
                height,
                canvas,
                ctx,
                image = new Image(),
                reader = new FileReader(),
                deferred = $.Deferred();

            image.onload = function () {
                canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;

                ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, image.width, image.height);

                if (file.exifData && file.exifData.orientation) {
                    self.correctOrientation(ctx, canvas, file.exifData.orientation);
                }

                scale = self.calculateScale(toSize, image.width, image.height);

                function handleResult(canvas) {
                    self.verbose('Resizing done', 5);
                    deferred.resolve(canvas.toDataURL(file.type, 0.9));
                    delete canvas, image, file;
                }

                if (scale >= 1) {
                    handleResult(canvas);
                    return;
                }

                width = Math.round(scale * image.width);
                height = Math.round(scale * image.height);

                if (highQuality === true) {
                    self.highQualityResize(canvas, image, width, height).then(handleResult);
                } else {
                    self.browserResize(canvas, image, width, height).then(handleResult);
                }
                delete ctx;
            };

            reader.onload = function (e) {
                image.src = e.target.result;
            };
            reader.readAsDataURL(file);

            return deferred.promise();
        },

        highQualityResize: function (canvas, image, width, height) {
            var deferred = $.Deferred();
            if (typeof canvasResize === 'function') {
                try {
                    var resized = document.createElement('canvas');
                    resized.width = width;
                    resized.height = height;
                    canvasResize(canvas, resized, function () {
                        deferred.resolve(resized);
                    });
                } catch (e) {
                    return this.browserResize(canvas, image, width, height);
                }
            } else {
                return this.browserResize(canvas, image, width, height);
            }
            return deferred.promise();
        },

        browserResize: function (canvas, image, width, height) {
            var deferred = $.Deferred(),
                ctx = canvas.getContext('2d');

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(image, 0, 0, width, height);

            deferred.resolve(canvas);
            return deferred.promise();
        },

        calculateScale: function (toSize, origWidth, origHeight) {
            if (toSize instanceof Array) {

                var scaleX = toSize[0] === 0 ? -1 : toSize[0] / origWidth,
                    scaleY = toSize[1] === 0 ? -1 : toSize[1] / origHeight;

                if ((scaleX > 0 && scaleX < scaleY) || scaleY === -1) {
                    return scaleX;
                }
                return scaleY;
            } else if (typeof toSize === 'number') {
                return Math.sqrt(toSize / (origWidth * origHeight));
            }
            throw 'Unsupported size ' + toSize;
        },

        correctOrientation: function (ctx, canvas, orientation) {
            switch (orientation) {
                case 2:
                    // horizontal flip
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                    break;
                case 3:
                    // 180° rotate left
                    ctx.translate(canvas.width, canvas.height);
                    ctx.rotate(Math.PI);
                    break;
                case 4:
                    // vertical flip
                    ctx.translate(0, canvas.height);
                    ctx.scale(1, -1);
                    break;
                case 5:
                    // vertical flip + 90 rotate right
                    ctx.rotate(0.5 * Math.PI);
                    ctx.scale(1, -1);
                    break;
                case 6:
                    // 90° rotate right
                    ctx.rotate(0.5 * Math.PI);
                    ctx.translate(0, -canvas.height);
                    break;
                case 7:
                    // horizontal flip + 90 rotate right
                    ctx.rotate(0.5 * Math.PI);
                    ctx.translate(canvas.width, -canvas.height);
                    ctx.scale(-1, 1);
                    break;
                case 8:
                    // 90° rotate left
                    ctx.rotate(-0.5 * Math.PI);
                    ctx.translate(-canvas.width, 0);
                    break;
            }
        },

        extractEXIFData: function (file, img) {
            var self = this,
                deferred = $.Deferred();

            if (self.options.extractExif !== false) {
                EXIF.getData(file, function () {
                    var EXIFSelf = this,
                        exifData = {};

                    $.each(self.options.extractExif, function () {
                        exifData[this] = EXIF.getTag(EXIFSelf, this);
                    });

                    deferred.resolve(exifData);
                });
            } else {
                deferred.resolve({});
            }

            return deferred.promise();
        },

        /**
         * Do the actual uploading
         */
        upload: function () {
            var self = this,
                images = [],
                totalImageCount = 0;

            // Make sure the set of images is an array
            for (i = 0; i < self.dropContainer.find('img').length; i++) {
                images[i] = $(self.dropContainer.find('img')[i]);
            }

            totalImageCount = images.length;

            $(self).trigger('upload-start', [totalImageCount]);

            /**
             * Recursive function to process all images concurrently (max workers)
             */
            var processImages = function () {
                if (images.length > 0 && self.workers.length < self.options.workers) {
                    $(self).trigger('upload-progress', [totalImageCount, totalImageCount - images.length + 1]);
                    self.uploadImage(images.shift());
                    setTimeout(processImages, 100);
                } else if (images.length > 0 || self.workers.length > 0) {
                    setTimeout(processImages, 500);
                } else {
                    $(self).trigger('upload-complete');
                }
            };

            processImages();
        },

        getImageName: function (img) {
            return $(img).data('file').name;
        },

        getImageExif: function (img) {
            return $(img).data('file').exifData;
        },

        getImageData: function (img) {
            return $(img).data('file').customData || {};
        },

        setImageData: function (img, customData) {
            $(img).data('file').customData = customData;
        },

        uploadImage: function (img) {
            var self = this,
                file = img.data('file'),
                request = {},
                ajaxData = $.extend(true, {}, self.options.ajaxUpload),
                deferred = $.Deferred();

            self.verbose('Starting resize and upload process', 5);

            $(self).trigger('image-process', [img]);

            self.workers.push(request);
            self.resizeImage(file, self.uploadSize, true).then(function (dataStr) {
                ajaxData.data.src = dataStr;
                ajaxData.data.exif = file.exifData;
                ajaxData.data.name = file.name;
                ajaxData.data.customData = file.customData || {};

                $(self).trigger('image-upload', [img]);

                request.xhr = $.ajax(ajaxData).done(function (data, textStatus, xhr) {
                    img.parent().remove();
                    $(self).trigger('image-success', [img, data, textStatus, xhr]);
                }).fail(function (xhr, textStatus, errorThrown) {
                    $(self).trigger('image-error', [img, xhr, textStatus, errorThrown]);
                }).always(function (data, textStatus, xhr) {
                    var index = self.workers.indexOf(request);
                    if (index > -1) {
                        self.workers.splice(index, 1);
                    }

                    deferred.resolve([img]);

                    $(self).trigger('image-complete', [img, data, textStatus, xhr]);
                });
            });

            return deferred.promise();
        }
    };

    window.DynamicImageUpload = DynamicImageUpload;
})(jQuery);
