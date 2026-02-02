import fs from 'fs';
import path from 'path';

const distPath = path.join('dist', 'index.html');
const outputPath = path.join('src', 'htmlTemplate.js');

try {
    let htmlContent = fs.readFileSync(distPath, 'utf8');
    
    // Read crypto worker if it exists separately
    let cryptoWorkerContent = '';
    // Check for any .js file in dist that looks like the worker
    const files = fs.readdirSync('dist');
    const workerFile = files.find(f => f.includes('crypto.worker') && f.endsWith('.js'));
    
    if (workerFile) {
        cryptoWorkerContent = fs.readFileSync(path.join('dist', workerFile), 'utf8');
    }
    
    const escapedWorker = cryptoWorkerContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

    // Read favicon.ico and inline it into HTML
    let faviconBase64 = '';
    const faviconPath = path.join('dist', 'favicon.ico');
    if (fs.existsSync(faviconPath)) {
        const faviconBuffer = fs.readFileSync(faviconPath);
        faviconBase64 = faviconBuffer.toString('base64');
    }

    // Inline favicon into HTML content before escaping
    if (faviconBase64) {
        const dataUri = `data:image/x-icon;base64,${faviconBase64}`;
        // Replace /favicon.ico with data URI
        htmlContent = htmlContent.replace(/<link rel="icon" href="\/favicon.ico" \/>/g, `<link rel="icon" href="${dataUri}" />`);
        // Also catch if it was modified to something else or handled by Vite differently but still points to a file
        // Note: The previous regex is specific. Let's make it robust.
        // If vite didn't touch it, it's href="/favicon.ico".
    }

    // Escape backticks and other characters that might break the template string
    const escapedHtml = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');

    const jsContent = `
export const cryptoWorkerScript = \`${escapedWorker}\`;

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