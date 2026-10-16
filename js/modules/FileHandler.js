// FileHandler.js - File operations for scripts and downloads
export const FileHandler = {
  download(url, filename) {
    fetch(url)
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || 'download';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(err => {
        console.error('Download failed:', err);
        showToast('Falha ao baixar arquivo');
      });
  },

  async readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = e => reject(e);
      reader.readAsText(file);
    });
  }
};
export { FileHandler };