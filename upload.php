<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

$exifData = $_POST['exif'];
$customData = isset($_POST['customData'])?$_POST['customData']:array();
$name = $_POST['name'];

$withoutMime = substr($_POST['src'], strpos($_POST['src'], ",") + 1);
$src = base64_decode($withoutMime);

header('Content-Type: application/json');
echo json_encode([]);