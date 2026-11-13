const path = require('path');
const fs = require('fs/promises');
const mime = require('mime-types');
const { BlobServiceClient, ContentSettings } = require('@azure/storage-blob');

class AzureStaticService {
  constructor() {
    this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.containerName = '$web';
  }

  getClient() {
    if (!this.connectionString) {
      this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    }
    if (!this.connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set in backend/.env');
    }
    return BlobServiceClient.fromConnectionString(this.connectionString);
  }

  async verifyStaticHosting(onLog = () => {}) {
    const client = this.getClient();
    try {
      const containerClient = client.getContainerClient(this.containerName);
      const exists = await containerClient.exists();
      if (!exists) {
        onLog('Enabling static website hosting on Azure Storage Account...', 'info');
        await client.setServiceProperties({
          staticWebsite: {
            enabled: true,
            indexDocument: 'index.html',
            errorDocument404Path: 'index.html',
          },
        });
      }
      onLog('Azure Static Website storage is active and verified.', 'info');
      return true;
    } catch (err) {
      onLog(`Azure Static Website check warning: ${err.message}`, 'warn');
      return true;
    }
  }

  getWebsiteUrl(prefix = '') {
    const client = this.getClient();
    const accountName = client.accountName;
    const cleanPrefix = prefix ? prefix.replace(/^\/+|\/+$/g, '') : '';
    const baseHost = `https://${accountName}.z7.web.core.windows.net`;
    return cleanPrefix ? `${baseHost}/${cleanPrefix}/` : `${baseHost}/`;
  }

  async deployDirectory({ outputPath, prefix = '', onLog = () => {} }) {
    const client = this.getClient();
    const containerClient = client.getContainerClient(this.containerName);

    const uploadFiles = async (dir, currentPrefix) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const blobName = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await uploadFiles(fullPath, blobName);
        } else {
          const contentType = mime.lookup(entry.name) || 'application/octet-stream';
          let body = await fs.readFile(fullPath);

          if (entry.name.toLowerCase() === 'index.html' && currentPrefix) {
            const text = body.toString('utf8');
            const basePath = `/${currentPrefix}/`;
            const basePrefix = `/${currentPrefix}`;
            const normalizedPaths = text.replace(
              /\b(src|href)=("|')\/(?!\/)(?!api(?:\/|$))/g,
              `$1=$2${basePrefix}/`
            );
            body = Buffer.from(normalizedPaths, 'utf8');
            onLog(`Normalized asset paths for ${blobName}`, 'info');
          }

          const blockBlobClient = containerClient.getBlockBlobClient(blobName);
          await blockBlobClient.upload(body, body.length, {
            blobHTTPHeaders: { blobContentType: contentType },
          });
          onLog(`Uploaded ${blobName} (${contentType})`, 'debug');
        }
      }
    };

    onLog(`Uploading static build files to Azure Storage ($web)...`, 'info');
    await uploadFiles(outputPath, prefix);
    const websiteUrl = this.getWebsiteUrl(prefix);
    onLog(`Azure Static Website ready: ${websiteUrl}`, 'success');
    return websiteUrl;
  }

  async deleteDirectory(prefix, onLog = () => {}) {
    if (!prefix) return 0;
    const client = this.getClient();
    const containerClient = client.getContainerClient(this.containerName);
    const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
    let count = 0;
    for await (const blob of containerClient.listBlobsFlat({ prefix: cleanPrefix })) {
      await containerClient.deleteBlob(blob.name);
      count++;
    }
    onLog(`Purged ${count} files from Azure Storage ($web) under /${cleanPrefix}.`, 'info');
    return count;
  }
}

module.exports = new AzureStaticService();
