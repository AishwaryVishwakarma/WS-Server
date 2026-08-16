import {BadRequestException} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {ImageStorageService, type UploadedImage} from './image-storage.service';

describe('ImageStorageService', () => {
  const values: Record<string, string> = {
    APPWRITE_ENDPOINT: 'https://example.appwrite.io/v1',
    APPWRITE_PROJECT_ID: 'project',
    APPWRITE_API_KEY: 'secret',
    APPWRITE_IMAGE_BUCKET_ID: 'bucket',
    APPWRITE_IMAGE_NAMESPACE: 'production',
  };
  const service = new ImageStorageService({
    get: (key: string) => values[key],
  } as ConfigService);

  afterEach(() => jest.restoreAllMocks());

  it('uploads a real JPEG signature and returns its public view URL', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, {status: 201}));
    const file: UploadedImage = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      originalname: 'cover.jpg',
      mimetype: 'image/jpeg',
      size: 4,
    };

    const result = await service.upload(file, 'cover-story');

    expect(result.url).toContain(
      `/storage/buckets/bucket/files/${result.fileId}/view?project=project`
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.appwrite.io/v1/storage/buckets/bucket/files',
      expect.objectContaining({method: 'POST'})
    );
    const request = fetchMock.mock.calls[0][1];
    const form = request?.body as FormData;
    expect(form.get('permissions[]')).toBe('read("any")');
  });

  it('rejects a renamed non-image before contacting Appwrite', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const file: UploadedImage = {
      buffer: Buffer.from('not an image'),
      originalname: 'fake.png',
      mimetype: 'image/png',
      size: 12,
    };

    await expect(service.upload(file, 'profile-user')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('paginates through every Appwrite file when calculating storage', async () => {
    const page = Array.from({length: 100}, (_, index) => ({
      $id: `file-${index}`,
      name: `production--cover-${index}.jpg`,
      $createdAt: '2026-08-01T00:00:00.000Z',
      sizeOriginal: index + 1,
    }));
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({total: 101, files: page}), {status: 200})
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 101,
            files: [
              {
                $id: 'file-100',
                name: 'production--profile-100.webp',
                $createdAt: '2026-08-02T00:00:00.000Z',
                sizeOriginal: 101,
              },
            ],
          }),
          {status: 200}
        )
      );

    const files = await service.listAll();

    expect(files).toHaveLength(101);
    expect(files.at(-1)).toEqual({
      id: 'file-100',
      name: 'production--profile-100.webp',
      createdAt: '2026-08-02T00:00:00.000Z',
      size: 101,
    });
    const requestedUrl = fetchMock.mock.calls[1][0];
    if (typeof requestedUrl !== 'string') {
      throw new Error('Expected Appwrite request URL to be a string');
    }
    const secondUrl = new URL(requestedUrl);
    expect(secondUrl.searchParams.getAll('queries[]')).toEqual([
      JSON.stringify({method: 'limit', values: [100]}),
      JSON.stringify({method: 'offset', values: [100]}),
    ]);
  });

  it('defaults the displayed storage budget to 2 GiB', () => {
    expect(service.capacityBytes()).toBe(2 * 1024 * 1024 * 1024);
  });

  it('only owns files explicitly assigned to its namespace', () => {
    const file = {
      id: 'file',
      name: 'production--cover-story.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      size: 10,
    };
    expect(service.belongsToNamespace(file)).toBe(true);
    expect(service.belongsToNamespace({...file, name: 'cover-story.jpg'})).toBe(
      false
    );

    const development = new ImageStorageService({
      get: (key: string) =>
        key === 'APPWRITE_IMAGE_NAMESPACE' ? 'development' : values[key],
    } as ConfigService);
    expect(development.belongsToNamespace(file)).toBe(false);
    expect(
      development.belongsToNamespace({
        ...file,
        name: 'development--cover-story.jpg',
      })
    ).toBe(true);
  });
});
