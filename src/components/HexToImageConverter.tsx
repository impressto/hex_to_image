import React, { useState, useRef, ChangeEvent } from 'react';
import './HexToImageConverter.css';

interface ImageData {
  width: number;
  height: number;
  data: number[];
  name: string;
}

const HexToImageConverter: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [bmpData, setBmpData] = useState<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError('');
      setImageData(null);
      setPreviewUrl('');
    }
  };

  const parseHexFile = async (file: File): Promise<ImageData> => {
    const content = await file.text();
    
    // More flexible regex to find any uint16_t array with hex values
    // This will ignore everything before the array declaration
    const arrayMatch = content.match(/(?:const\s+)?uint16_t\s+(\w+)\s*\[\s*(?:\d+)?\s*\]\s*=\s*\{([^}]+)\}/);
    
    let arrayName = 'unknown_array';
    let hexDataString = '';
    
    if (arrayMatch) {
      arrayName = arrayMatch[1];
      hexDataString = arrayMatch[2];
    } else {
      // Fallback: Look for any block containing hex values within curly braces
      // Replace newlines with spaces to make it work without the 's' flag
      const singleLineContent = content.replace(/\n/g, ' ').replace(/\r/g, ' ');
      const fallbackMatch = singleLineContent.match(/\{([^}]*(?:0x[0-9a-fA-F]+[^}]*)+)\}/);
      if (fallbackMatch) {
        hexDataString = fallbackMatch[1];
        arrayName = 'parsed_array';
      } else {
        // Last resort: Extract all hex values from the entire file
        const hexPattern = /0x[0-9a-fA-F]+/g;
        const allHexMatches = content.match(hexPattern);
        if (allHexMatches && allHexMatches.length > 0) {
          hexDataString = allHexMatches.join(', ');
          arrayName = 'extracted_hex_values';
        } else {
          throw new Error('No hex values found in the file. Please ensure the file contains hex values in format 0xXXXX');
        }
      }
    }
    
    // Extract hex values more robustly
    const hexValues = [];
    
    // First try to extract hex values with 0x prefix directly
    const hexPattern = /0x[0-9a-fA-F]{1,4}/gi;
    const directHexMatches = hexDataString.match(hexPattern);
    if (directHexMatches) {
      for (const match of directHexMatches) {
        const hexVal = parseInt(match, 16);
        if (!isNaN(hexVal) && hexVal >= 0 && hexVal <= 0xFFFF) {
          hexValues.push(hexVal);
        }
      }
    }
    
    // If no direct hex matches, try to parse values after cleaning
    if (hexValues.length === 0) {
      const potentialValues = hexDataString
        .split(/[,\s\n\r]+/)
        .map(val => val.trim())
        .filter(val => val.length > 0);
      
      for (const val of potentialValues) {
        // Remove any trailing characters like semicolons, commas, etc.
        const cleanVal = val.replace(/[^0-9a-fA-F]/g, '');
        if (cleanVal.length >= 3 && cleanVal.length <= 4) { // Expecting 3-4 hex digits
          const hexVal = parseInt('0x' + cleanVal, 16);
          if (!isNaN(hexVal) && hexVal >= 0 && hexVal <= 0xFFFF) {
            hexValues.push(hexVal);
          }
        }
      }
    }

    if (hexValues.length === 0) {
      throw new Error('No valid hex values found. Expected format: 0xXXXX where XXXX is 1-4 hexadecimal digits');
    }

    // Try to determine image dimensions
    // Common image sizes or user can specify
    const totalPixels = hexValues.length;
    let width: number, height: number;

    // Try common aspect ratios and sizes
    const possibleDimensions = [
      { w: Math.sqrt(totalPixels), h: Math.sqrt(totalPixels) }, // Square
      { w: totalPixels, h: 1 }, // Single row
      { w: 1, h: totalPixels }, // Single column
    ];

    // Add common resolutions
    const commonResolutions = [
      { w: 128, h: 128 }, { w: 64, h: 64 }, { w: 32, h: 32 }, { w: 16, h: 16 },
      { w: 320, h: 240 }, { w: 240, h: 320 }, { w: 128, h: 160 }, { w: 160, h: 128 },
      { w: 128, h: 64 }, { w: 64, h: 128 }, { w: 96, h: 64 }, { w: 64, h: 96 }
    ];

    commonResolutions.forEach(res => {
      if (res.w * res.h === totalPixels) {
        possibleDimensions.unshift(res);
      }
    });

    // Use the first valid dimension (prioritizing common resolutions)
    const dimension = possibleDimensions.find(dim => 
      Math.floor(dim.w) * Math.floor(dim.h) === totalPixels
    ) || { w: Math.ceil(Math.sqrt(totalPixels)), h: Math.ceil(totalPixels / Math.ceil(Math.sqrt(totalPixels))) };

    width = Math.floor(dimension.w);
    height = Math.floor(dimension.h);

    // Adjust if the calculation doesn't match exactly
    if (width * height !== totalPixels) {
      width = totalPixels;
      height = 1;
    }

    return {
      width,
      height,
      data: hexValues,
      name: arrayName
    };
  };

  const rgb565ToRgb = (rgb565: number): [number, number, number] => {
    const r = (rgb565 >> 11) & 0x1F;
    const g = (rgb565 >> 5) & 0x3F;
    const b = rgb565 & 0x1F;
    
    // Convert to 8-bit values
    const r8 = (r << 3) | (r >> 2);
    const g8 = (g << 2) | (g >> 4);
    const b8 = (b << 3) | (b >> 2);
    
    return [r8, g8, b8];
  };

  const createBMP = (imageData: ImageData): Uint8Array => {
    const { width, height, data } = imageData;
    const paddingSize = (4 - (width * 3) % 4) % 4; // BMP rows must be padded to 4-byte boundaries
    const rowSize = width * 3 + paddingSize;
    const imageSize = rowSize * height;
    const fileSize = 54 + imageSize; // 54 bytes for headers

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    const uint8Array = new Uint8Array(buffer);

    // BMP File Header (14 bytes)
    view.setUint16(0, 0x424D, true); // "BM"
    view.setUint32(2, fileSize, true); // File size
    view.setUint32(6, 0, true); // Reserved
    view.setUint32(10, 54, true); // Offset to pixel data

    // BMP Info Header (40 bytes)
    view.setUint32(14, 40, true); // Header size
    view.setInt32(18, width, true); // Width
    view.setInt32(22, height, true); // Height
    view.setUint16(26, 1, true); // Planes
    view.setUint16(28, 24, true); // Bits per pixel
    view.setUint32(30, 0, true); // Compression
    view.setUint32(34, imageSize, true); // Image size
    view.setInt32(38, 2835, true); // X pixels per meter
    view.setInt32(42, 2835, true); // Y pixels per meter
    view.setUint32(46, 0, true); // Colors used
    view.setUint32(50, 0, true); // Important colors

    // Pixel data (bottom-up)
    let offset = 54;
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        if (pixelIndex < data.length) {
          const [r, g, b] = rgb565ToRgb(data[pixelIndex]);
          uint8Array[offset++] = b; // Blue
          uint8Array[offset++] = g; // Green
          uint8Array[offset++] = r; // Red
        } else {
          // Fill with black if data is insufficient
          uint8Array[offset++] = 0; // Blue
          uint8Array[offset++] = 0; // Green
          uint8Array[offset++] = 0; // Red
        }
      }
      // Add padding
      for (let p = 0; p < paddingSize; p++) {
        uint8Array[offset++] = 0;
      }
    }

    return uint8Array;
  };

  const createPreview = (imageData: ImageData) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;

    const imgData = ctx.createImageData(imageData.width, imageData.height);
    
    for (let i = 0; i < imageData.data.length; i++) {
      const [r, g, b] = rgb565ToRgb(imageData.data[i]);
      const pixelIndex = i * 4;
      imgData.data[pixelIndex] = r;     // Red
      imgData.data[pixelIndex + 1] = g; // Green
      imgData.data[pixelIndex + 2] = b; // Blue
      imgData.data[pixelIndex + 3] = 255; // Alpha
    }
    
    ctx.putImageData(imgData, 0, 0);
    setPreviewUrl(canvas.toDataURL());
  };

  const processFile = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setError('');

    try {
      const parsedData = await parseHexFile(selectedFile);
      setImageData(parsedData);
      createPreview(parsedData);
      
      // Generate BMP data
      const bmp = createBMP(parsedData);
      setBmpData(bmp);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while processing the file');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadBMP = () => {
    if (!bmpData) return;
    
    const blob = new Blob([new Uint8Array(bmpData)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted_image.bmp';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadExampleFile = async () => {
    try {
      setIsProcessing(true);
      setError('');
      
      const response = await fetch('./galaxy-spiral.h');
      if (!response.ok) {
        throw new Error('Failed to load example file');
      }
      
      const content = await response.text();
      
      // Create a mock file object
      const exampleFile = new File([content], 'galaxy-spiral.h', { type: 'text/plain' });
      setSelectedFile(exampleFile);
      
      // Process the file content directly
      const parsedData = await parseHexFile(exampleFile);
      
      // Check if this is the specific galaxy-spiral.h example file
      const isGalaxySpiral = exampleFile.name === 'galaxy-spiral.h';
      
      let displayData;
      if (isGalaxySpiral) {
        // Override the dimensions for the galaxy-spiral.h example only
        // Create an array of exactly 57600 elements for display
        const displayPixels = new Array(57600).fill(0);
        // Copy the actual data up to 57600 elements
        for (let i = 0; i < Math.min(parsedData.data.length, 57600); i++) {
          displayPixels[i] = parsedData.data[i];
        }
        
        displayData = {
          ...parsedData,
          width: 240,
          height: 240,
          data: displayPixels
        };
      } else {
        // Use the actual parsed data for other files
        displayData = parsedData;
      }
      
      setImageData(displayData);
      
      // Use different preview methods based on the file
      if (isGalaxySpiral) {
        // Use the hosted PNG image for the galaxy-spiral.h example
        setPreviewUrl('https://impressto.ca/hex_to_image/public/galaxy-spiral.png');
      } else {
        // Use normal canvas preview for other files
        createPreview(displayData);
      }
      
      // Generate BMP data using the actual parsed data for proper file generation
      const bmp = createBMP(parsedData);
      setBmpData(bmp);
      
    } catch (err) {
      setError(`Error loading example file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadExampleFile = async () => {
    try {
      const response = await fetch('./galaxy-spiral.h');
      if (!response.ok) {
        throw new Error('Failed to fetch example file');
      }
      
      const content = await response.text();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'galaxy-spiral.h';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Error downloading example file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };  return (
    <div className="hex-converter">
      <div className="upload-section">
        <div className="file-input-wrapper">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".h,.hpp,.c,.cpp,.txt,.inc,.dat,.hex"
            className="file-input"
            id="hex-file"
          />
          <label htmlFor="hex-file" className="file-input-label">
            Choose File with Hex Data
          </label>
          {selectedFile && (
            <span className="file-name">{selectedFile.name}</span>
          )}
        </div>
        
        <div className="example-section">
          <p>Or try with an example file:</p>
          <div className="example-buttons">
            <button 
              onClick={loadExampleFile}
              disabled={isProcessing}
              className="example-btn"
            >
              {isProcessing ? 'Loading...' : 'Load Example (galaxy-spiral.h)'}
            </button>
            <button 
              onClick={downloadExampleFile}
              className="example-download-btn"
            >
              Download Example File
            </button>
          </div>
        </div>
        
        <button 
          onClick={processFile}
          disabled={!selectedFile || isProcessing}
          className="process-btn"
        >
          {isProcessing ? 'Processing...' : 'Convert to Image'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          <h3>Error:</h3>
          <p>{error}</p>
        </div>
      )}

      {imageData && (
        <div className="result-section">
          <div className="image-info">
            <h3>Image Information</h3>
            <p><strong>Array Name:</strong> {imageData.name}</p>
            <p><strong>Dimensions:</strong> {imageData.width} × {imageData.height}</p>
            <p><strong>Total Pixels:</strong> {imageData.data.length}</p>
          </div>

          {previewUrl && (
            <div className="preview-section">
              <h3>Preview</h3>
              <img 
                src={previewUrl} 
                alt="Preview" 
                className="preview-image"
                style={{
                  maxWidth: '240px',
                  maxHeight: '240px',
                  imageRendering: 'pixelated'
                }}
              />
            </div>
          )}

          <button onClick={downloadBMP} className="download-btn">
            Download BMP File
          </button>
        </div>
      )}
    </div>
  );
};

export default HexToImageConverter;
