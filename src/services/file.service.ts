import api from '@/lib/api'; // Assuming 'api' is an Axios instance configured with interceptors
import { AxiosError } from 'axios'; // Import AxiosError for type safety
import { ProcessedData } from '@/lib/file-processor';
// --- Type Definitions ---

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  uploadedAt: string; // ISO string format
   processedData?: ProcessedData; // Consider a more specific type if structure is known
  // Add any other properties returned by your backend for an uploaded file (e.g., userId, filePath)
}

// --- FileService Class ---

export class FileService {

  /**
   * Uploads a file to the server with progress tracking.
   * Assumes 'api' (Axios instance) is configured to automatically attach authentication tokens.
   * @param file The File object to upload.
   * @param onProgress Callback function for upload progress (0-100).
   * @returns A Promise that resolves with the UploadedFile details from the backend.
   * @throws An error if the upload fails.
   */
  static async uploadFile(file: File, onProgress?: (progress: number) => void): Promise<UploadedFile> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post<UploadedFile>('/api/files/upload', formData, {
        headers: {
          // 'Content-Type': 'multipart/form-data' is usually set automatically by Axios for FormData
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(progress);
          }
        },
      });

      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      // Provide a more specific error message from the backend if available
      throw new Error(axiosError.response?.data?.message || 'File upload failed. Please try again.');
    }
  }

  /**
   * Retrieves a list of all uploaded files for the authenticated user.
   * Assumes 'api' (Axios instance) is configured to automatically attach authentication tokens.
   * @returns A Promise that resolves with an array of UploadedFile objects.
   * @throws An error if fetching files fails.
   */
  static async getFiles(): Promise<UploadedFile[]> {
    try {
      const response = await api.get<UploadedFile[]>('/api/files');
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to fetch files. Please refresh and try again.');
    }
  }

   static async getFile(id: string): Promise<UploadedFile> {
    try {
      const response = await api.get(`/api/files/${id}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch file');
    }
  }
  /**
   * Deletes a specific file by its ID.
   * Assumes 'api' (Axios instance) is configured to automatically attach authentication tokens.
   * @param id The ID of the file to delete.
   * @returns A Promise that resolves when the file is successfully deleted.
   * @throws An error if deleting the file fails.
   */
  static async deleteFile(id: string): Promise<void> {
    try {
      await api.delete(`/api/files/${id}`);
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to delete file. It might already be gone.');
    }
  }

  /**
   * Downloads a specific file by its ID.
   * Assumes 'api' (Axios instance) is configured to automatically attach authentication tokens.
   * @param id The ID of the file to download.
   * @returns A Promise that resolves with a Blob containing the file data.
   * @throws An error if downloading the file fails.
   */
  static async downloadFile(id: string): Promise<Blob> {
    try {
      const response = await api.get<Blob>(`/api/files/${id}/download`, {
        responseType: 'blob', // Important for binary data
      });
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to download file. It may no longer exist.');
    }
  }

  /**
   * Initiates server-side processing for a specific file.
   * Assumes 'api' (Axios instance) is configured to automatically attach authentication tokens.
   * @param id The ID of the file to process.
   * @returns A Promise that resolves with the processing result (type 'any' for flexibility, but ideally more specific).
   * @throws An error if file processing fails.
   */
  static async processFile(id: string): Promise<any> {
    try {
      const response = await api.post(`/api/files/${id}/process`);
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ message?: string; code?: string }>;
      throw new Error(axiosError.response?.data?.message || 'Failed to process file. Check file integrity.');
    }
  }
}