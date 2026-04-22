use std::fs::File;
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageReader};
use tempfile::NamedTempFile;

use crate::error::AppError;

fn apply_orientation(image: DynamicImage, orientation: u32) -> DynamicImage {
  match orientation {
    2 => image.fliph(),
    3 => image.rotate180(),
    4 => image.flipv(),
    5 => image.rotate90().fliph(),
    6 => image.rotate90(),
    7 => image.rotate270().fliph(),
    8 => image.rotate270(),
    _ => image,
  }
}

fn read_orientation(path: &Path) -> u32 {
  let Ok(file) = File::open(path) else {
    return 1;
  };
  let mut reader = std::io::BufReader::new(file);
  let Ok(exif) = exif::Reader::new().read_from_container(&mut reader) else {
    return 1;
  };
  exif
    .get_field(exif::Tag::Orientation, exif::In::PRIMARY)
    .and_then(|field| field.value.get_uint(0))
    .unwrap_or(1)
}

pub fn preprocess_image(path: &Path) -> Result<NamedTempFile, AppError> {
  let mut image = ImageReader::open(path)?.with_guessed_format()?.decode()?;
  image = apply_orientation(image, read_orientation(path));

  let (width, height) = image.dimensions();
  let max_edge = width.max(height);
  if max_edge > 1920 {
    let scale = 1920.0 / max_edge as f32;
    let resized_width = ((width as f32) * scale).round().max(1.0) as u32;
    let resized_height = ((height as f32) * scale).round().max(1.0) as u32;
    image = image.resize(resized_width, resized_height, FilterType::Lanczos3);
  }

  let temp = NamedTempFile::new()?;
  let mut writer = std::io::BufWriter::new(temp.reopen()?);
  let mut encoder = JpegEncoder::new_with_quality(&mut writer, 85);
  encoder.encode_image(&image)?;

  Ok(temp)
}

#[cfg(test)]
mod tests {
  use std::fs::File;

  use image::codecs::jpeg::JpegEncoder;
  use image::{ImageBuffer, Rgb};

  use super::preprocess_image;

  #[test]
  fn keeps_small_images_without_upscaling() {
    let input = tempfile::Builder::new().suffix(".jpg").tempfile().unwrap();
    let image = ImageBuffer::<Rgb<u8>, Vec<u8>>::from_pixel(800, 600, Rgb([40, 40, 40]));
    let mut file = File::create(input.path()).unwrap();
    let mut encoder = JpegEncoder::new_with_quality(&mut file, 85);
    encoder.encode_image(&image).unwrap();

    let output = preprocess_image(input.path()).unwrap();
    let processed = image::open(output.path()).unwrap();
    assert_eq!(processed.width(), 800);
    assert_eq!(processed.height(), 600);
  }
}
