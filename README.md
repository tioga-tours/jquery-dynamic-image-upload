# jQuery dynamic image upload

Resize images in the browser using a canvas.


[Demo](https://tech.tiogatours.nl/jquery-dynamic-image-upload/sample.htm)

Supports:

- Support drag-n-drop
- Support file selection
- AJAX file upload
- [OPTIONAL] Better resize with [limby-resize](https://github.com/danschumann/limby-resize)
- [OPTIONAL] Use [speedtest](https://github.com/tioga-tours/jquery-speedtest) to auto-select the best upload quality.
- [OPTIONAL] Extract EXIF data with [exif-js](https://github.com/exif-js/exif-js)

It helps for uploads over slow internet connections and uploads file by file, so not all the progress is lost
when the connection drops.

## Usage

```html
<div id="drop-container">
<input type="file" multiple style="display:none;"/>
</div>
<button id="upload">Upload</button>
```

```javascript
var diu = new DynamicImageUpload($('#drop-container'), {
/* Configure options */
});

// Set additional data on an image
$('#drop-container').on('click', 'img', function (e) {
    // Prevent click on drop container
    e.stopPropagation();

    // $(this) is the <img> element
    diu.setImageData($(this), {data:'value'});

    // Get the file name
    var filename = diu.getImageName($(this));

    // Get the extracted exif
    var exif = diu.getImageExif($(this));

    // Or remove the image from the container (and thus from the upload-queue)
    $($(this).parents('.img-container')).remove();
});

// When button click, upload all files
$('#upload').on('click', function () {
    diu.upload();
});
```