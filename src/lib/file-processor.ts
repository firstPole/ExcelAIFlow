import * as XLSX from 'xlsx';
import Papa from 'papaparse';


export interface ProcessedData {
  headers: string[];
  rows: any[][];
  metadata: {
    rowCount: number;
    columnCount: number;
    fileType: string;
    hasHeaders: boolean;
  };
}

export class FileProcessor {
  static async processExcelFile(file: File): Promise<ProcessedData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get first worksheet
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length === 0) {
            throw new Error('File appears to be empty');
          }
          
          const headers = jsonData[0] as string[];
          const rows = jsonData.slice(1) as any[][];
          
          resolve({
            headers,
            rows,
            metadata: {
              rowCount: rows.length,
              columnCount: headers.length,
              fileType: file.name.endsWith('.xlsx') ? 'xlsx' : 'xls',
              hasHeaders: true
            }
          });
        } catch (error) {
          reject(new Error(`Failed to process Excel file: ${error.message}`));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  }

  static async processCSVFile(file: File): Promise<ProcessedData> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results) => {
          try {
            if (results.errors.length > 0) {
              throw new Error(`CSV parsing errors: ${results.errors.map(e => e.message).join(', ')}`);
            }
            
            const data = results.data as string[][];
            if (data.length === 0) {
              throw new Error('CSV file appears to be empty');
            }
            
            const headers = data[0];
            const rows = data.slice(1);
            
            resolve({
              headers,
              rows,
              metadata: {
                rowCount: rows.length,
                columnCount: headers.length,
                fileType: 'csv',
                hasHeaders: true
              }
            });
          } catch (error) {
            reject(error);
          }
        },
        error: (error) => reject(new Error(`Failed to parse CSV: ${error.message}`)),
        header: false,
        skipEmptyLines: true
      });
    });
  }

  static async processFile(file: File): Promise<ProcessedData> {
    const extension = file.name.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'xlsx':
      case 'xls':
        return this.processExcelFile(file);
      case 'csv':
        return this.processCSVFile(file);
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }
  }
}