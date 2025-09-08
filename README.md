# Hex to Image Converter

A React-based web application that converts C header files containing hexadecimal image data into downloadable BMP files. This tool is particularly useful for embedded developers working with displays and image data stored as arrays in C header files.

## Features

- **Upload Any File**: Support for `.h`, `.hpp`, `.c`, `.cpp`, `.txt`, `.inc`, `.dat`, `.hex` files
- **Flexible Parsing**: Extracts hex values from any file format, ignoring includes, comments, and other code
- **Automatic Parsing**: Extracts `uint16_t` arrays with hex values from anywhere in the file
- **RGB565 Support**: Interprets 16-bit color values in RGB565 format
- **Smart Dimension Detection**: Automatically determines image dimensions based on array size
- **Live Preview**: Shows a preview of the converted image with pixel-perfect rendering
- **BMP Export**: Downloads the converted image as a standard BMP file
- **Beautiful UI**: Modern, responsive design with gradient backgrounds
- **PHP Integration**: Ready for deployment on static web servers

## Quick Start

### Development
```bash
npm install
npm start
```
Access at: `http://localhost:3000`

### Production Deployment
```bash
./deploy.sh
```
Access at: `http://your-server/homelab/hex_to_image.php`

## Supported Formats

The application now accepts ANY file containing hex values and automatically extracts them:

### Strict Format (Preferred)
```c
const uint16_t array_name[] = {
  0xF800, 0x07E0, 0x001F, 0xFFFF,
  0x0000, 0xF81F, 0x07FF, 0xFFE0,
  // ... more hex values
};
```

### Flexible Formats (Also Supported)
```c
// With size specification
uint16_t image_data[64] = {0xF800, 0x07E0, ...};

// With includes and comments
#include <stdint.h>
// Some comment
const uint16_t data[] = {0x1234, 0x5678};

// Mixed with other code
void function() { ... }
const uint16_t pixels[] = {0xFFFF, 0x0000};
int variable = 123;

// Even loose hex values
0x1234, 0x5678, 0x9ABC, 0xDEF0
```

### Color Format
- **RGB565**: 16-bit color format commonly used in embedded displays
  - Red: 5 bits (bits 15-11)
  - Green: 6 bits (bits 10-5)  
  - Blue: 5 bits (bits 4-0)

### Common RGB565 Values
- `0xF800` - Pure Red
- `0x07E0` - Pure Green  
- `0x001F` - Pure Blue
- `0xFFFF` - White
- `0x0000` - Black
- `0xF81F` - Magenta
- `0x07FF` - Cyan
- `0xFFE0` - Yellow

## Scripts Reference

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `./deploy.sh` - Deploy to production
- `./check-deployment.sh` - Check deployment status

## Sample Files

The application includes several sample files for testing:
- `sample_image.h` - Simple 8x8 test pattern (red/green/black/white)
- `colorful_gradient.h` - Complex 16x16 gradient pattern
- `complex_header.h` - Full C header with includes, comments, and functions (12x12 logo)

## Technical Details

### BMP File Format
- Creates 24-bit BMP files (RGB format)
- Includes proper BMP headers and padding
- Bottom-up pixel arrangement (BMP standard)

### RGB565 to RGB888 Conversion
- Expands 5-bit red/blue to 8-bit with bit shifting
- Expands 6-bit green to 8-bit with bit shifting
- Maintains color accuracy during conversion

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).

## License

This project is open source and available under the [MIT License](LICENSE).
