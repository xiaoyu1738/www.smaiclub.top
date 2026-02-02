import fs from 'fs';
import path from 'path';

const distPath = path.join('dist', 'index.html');
const workerDistPath = path.join('dist', 'crypto.worker.js'); // Assuming vite builds this separately or we extract it
const outputPath = path.join('src', 'htmlTemplate.js');

try {
    let htmlContent = fs.readFileSync(distPath, 'utf8');
    
    // We need to extract the crypto worker script content if it's built into a separate file
    // Or if it's inlined, we might need to handle it differently.
    // Based on previous steps, vite-plugin-singlefile inlines everything.
    // However, the worker script is loaded via new Worker() which needs a URL or a Blob URL.
    // If singlefile inlines it, it might be as a base64 string or blob.
    // But our source code expects to serve it from /assets/crypto.worker.js
    
    // Let's check if dist/assets/crypto.worker.js exists (it might not if singlefile inlined it)
    // Actually, vite-plugin-singlefile might inline the worker if configured, but workers are tricky.
    // Let's assume for now we want to embed the HTML string into the worker.

    // Escape backticks and other characters that might break the template string
    const escapedHtml = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

    // Read crypto worker if it exists separately
    let cryptoWorkerContent = '';
    // Check for any .js file in dist that looks like the worker
    const files = fs.readdirSync('dist');
    const workerFile = files.find(f => f.includes('crypto.worker') && f.endsWith('.js'));
    
    if (workerFile) {
        cryptoWorkerContent = fs.readFileSync(path.join('dist', workerFile), 'utf8');
    }
    
    const escapedWorker = cryptoWorkerContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

    // Read favicon.ico
    let faviconBase64 = '';
    const faviconPath = path.join('dist', 'favicon.ico');
    if (fs.existsSync(faviconPath)) {
        const faviconBuffer = fs.readFileSync(faviconPath);
        faviconBase64 = faviconBuffer.toString('base64');
    }

    const jsContent = `
export const cryptoWorkerScript = \`${escapedWorker}\`;
export const faviconIco = "${faviconBase64}";

export function htmlTemplate() {
  return \`${escapedHtml}\`;
}
`;

    fs.writeFileSync(outputPath, jsContent);
    console.log('Successfully updated htmlTemplate.js with built frontend assets.');

} catch (err) {
    console.error('Error updating htmlTemplate.js:', err);
    process.exit(1);
}