const axios = require('axios');
const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');

class BlobBuildService {
  constructor() {
    this.containerName = process.env.AZURE_BLOB_CONTAINER || 'cloudops-artifacts';
  }

  getCredentials() {
    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is not set in backend/.env');
    }
    const parts = connStr.split(';').reduce((acc, part) => {
      const [k, ...v] = part.split('=');
      if (k) acc[k.trim()] = v.join('=').trim();
      return acc;
    }, {});

    if (!parts.AccountName || !parts.AccountKey) {
      throw new Error('Unable to parse AccountName and AccountKey from AZURE_STORAGE_CONNECTION_STRING');
    }

    return {
      accountName: parts.AccountName,
      accountKey: parts.AccountKey,
      credential: new StorageSharedKeyCredential(parts.AccountName, parts.AccountKey),
      client: BlobServiceClient.fromConnectionString(connStr),
    };
  }

  parseGitHubUrl(repoUrl) {
    if (!repoUrl) throw new Error('Repository URL is required');
    const cleaned = repoUrl.trim().replace(/\.git$/, '');
    const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      throw new Error(`Invalid GitHub repository URL: "${repoUrl}". Expected format: https://github.com/owner/repo`);
    }
    return { owner: match[1], repo: match[2] };
  }

  generateSasUrl(blobName, durationMinutes = 60) {
    const { accountName, credential } = this.getCredentials();
    const startsOn = new Date();
    const expiresOn = new Date(startsOn.valueOf() + durationMinutes * 60 * 1000);

    const sasQuery = generateBlobSASQueryParameters(
      {
        containerName: this.containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'), // Read-only
        startsOn,
        expiresOn,
      },
      credential
    ).toString();

    return `https://${accountName}.blob.core.windows.net/${this.containerName}/${blobName}?${sasQuery}`;
  }

  /**
   * Stream a repository tarball directly from GitHub into Azure Blob Storage.
   * Uses 0 KB of local backend disk space.
   */
  async streamGitHubToBlob({
    repoUrl,
    branch,
    githubToken,
    deploymentId,
    appName,
    onLog = () => {},
  }) {
    const { owner, repo } = this.parseGitHubUrl(repoUrl);
    const { client } = this.getCredentials();

    onLog(`[Storage Engine] Connecting to Azure Blob container "${this.containerName}"...`, 'info');
    const containerClient = client.getContainerClient(this.containerName);
    await containerClient.createIfNotExists();

    const headers = {
      'User-Agent': 'CloudOps-Deployer',
      Accept: 'application/vnd.github+json',
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    let targetBranch = branch;
    if (!targetBranch) {
      try {
        const repoRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
          headers,
          timeout: 10000,
        });
        targetBranch = repoRes.data.default_branch || 'main';
      } catch (err) {
        onLog(`[Storage Engine] Could not fetch default branch via GitHub API (${err.message}). Defaulting to "main".`, 'warn');
        targetBranch = 'main';
      }
    }

    const tarballUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${targetBranch}`;
    onLog(`[Storage Engine] Fetching repo archive stream from GitHub (${owner}/${repo}@${targetBranch})...`, 'info');

    const response = await axios({
      method: 'get',
      url: tarballUrl,
      responseType: 'stream',
      headers,
      maxRedirects: 5,
      timeout: 30000,
    });

    const sanitizedApp = (appName || repo).toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const blobName = `builds/${sanitizedApp}-${deploymentId}.tar.gz`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    onLog(`[Storage Engine] Zero-disk pipe: streaming tarball directly into Azure Blob "${blobName}"...`, 'info');

    // 4MB buffer chunks, 4 parallel buffers
    await blockBlobClient.uploadStream(response.data, 4 * 1024 * 1024, 4, {
      blobHTTPHeaders: { blobContentType: 'application/gzip' },
    });

    const props = await blockBlobClient.getProperties();
    const sizeBytes = props.contentLength || 0;
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
    onLog(`[Storage Engine] Tarball successfully streamed to Azure Blob (${sizeMb} MB, 0 KB local disk used).`, 'success');

    const sasUrl = this.generateSasUrl(blobName, 60);

    return {
      blobName,
      sasUrl,
      sizeBytes,
      branch: targetBranch,
      owner,
      repo,
    };
  }

  /**
   * Delete the temporary build tarball from Azure Blob Storage.
   */
  async deleteBuildBlob(blobName, onLog = () => {}) {
    if (!blobName) return;
    try {
      const { client } = this.getCredentials();
      const containerClient = client.getContainerClient(this.containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
      onLog(`[Storage Engine] Cleaned up temporary build blob: ${blobName}`, 'info');
    } catch (err) {
      console.warn(`[Storage Engine] Warning: failed to delete build blob "${blobName}":`, err.message);
    }
  }
}

module.exports = new BlobBuildService();
