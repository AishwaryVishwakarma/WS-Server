import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {randomUUID} from 'crypto';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

interface ImageType {
  extension: 'jpg' | 'png' | 'webp';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);

  constructor(private readonly config: ConfigService) {}

  async upload(file: UploadedImage, namePrefix: string) {
    const type = this.detectImageType(file);
    const fileId = randomUUID();
    const endpoint = this.required('APPWRITE_ENDPOINT').replace(/\/$/, '');
    const projectId = this.required('APPWRITE_PROJECT_ID');
    const bucketId = this.required('APPWRITE_IMAGE_BUCKET_ID');
    const form = new FormData();
    form.append('fileId', fileId);
    // These URLs are rendered directly by browsers in public story/profile
    // pages. Appwrite otherwise grants access only to the uploader, which is
    // the server API key here—not the reader viewing the page.
    form.append('permissions[]', 'read("any")');
    form.append(
      'file',
      new Blob([Uint8Array.from(file.buffer)], {type: type.mimeType}),
      `${namePrefix}.${type.extension}`
    );

    let response: Response;
    try {
      response = await fetch(`${endpoint}/storage/buckets/${bucketId}/files`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
      });
    } catch {
      throw new ServiceUnavailableException('Image storage is unavailable');
    }
    if (!response.ok) {
      const detail = await this.responseError(response);
      this.logger.error(
        `Appwrite upload failed (${response.status}): ${detail}`
      );
      throw new BadGatewayException('Image storage rejected the upload');
    }

    return {
      fileId,
      url:
        `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/` +
        `${encodeURIComponent(fileId)}/view?project=${encodeURIComponent(projectId)}`,
    };
  }

  async delete(fileId: string): Promise<void> {
    const endpoint = this.required('APPWRITE_ENDPOINT').replace(/\/$/, '');
    const bucketId = this.required('APPWRITE_IMAGE_BUCKET_ID');
    try {
      const response = await fetch(
        `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(fileId)}`,
        {method: 'DELETE', headers: this.headers()}
      );
      if (!response.ok && response.status !== 404) {
        throw new BadGatewayException('Image storage rejected the deletion');
      }
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new ServiceUnavailableException('Image storage is unavailable');
    }
  }

  private headers() {
    return {
      'X-Appwrite-Project': this.required('APPWRITE_PROJECT_ID'),
      'X-Appwrite-Key': this.required('APPWRITE_API_KEY'),
    };
  }

  private required(key: string): string {
    const value = this.config.get<string>(key);
    if (!value)
      throw new ServiceUnavailableException('Image uploads are not configured');
    return value;
  }

  private async responseError(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as {message?: unknown};
      return typeof body.message === 'string'
        ? body.message.slice(0, 500)
        : response.statusText;
    } catch {
      return response.statusText;
    }
  }

  private detectImageType(file: UploadedImage): ImageType {
    if (!file?.buffer?.length || file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image must be no larger than 5 MB');
    }
    const bytes = file.buffer;
    if (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    ) {
      return {extension: 'jpg', mimeType: 'image/jpeg'};
    }
    if (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      return {extension: 'png', mimeType: 'image/png'};
    }
    if (
      bytes.length >= 12 &&
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return {extension: 'webp', mimeType: 'image/webp'};
    }
    throw new BadRequestException('Only JPG, PNG, and WebP images are allowed');
  }
}
