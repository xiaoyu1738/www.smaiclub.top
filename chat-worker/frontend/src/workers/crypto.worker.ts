// Web Worker for handling cryptographic operations

self.onmessage = async (e: MessageEvent) => {
    const { id, type, payload } = e.data;

    try {
        let result;
        switch (type) {
            case 'deriveKey':
                result = await deriveKey(payload.password, payload.salt, payload.iterations);
                break;
            case 'encrypt':
                result = await encryptMessage(payload.key, payload.content);
                break;
            case 'decrypt':
                result = await decryptMessage(payload.key, payload.iv, payload.content);
                break;
            case 'sha256':
                result = await sha256Hex(payload.content);
                break;
            case 'hmacSha256':
                result = await hmacSha256Hex(payload.secretHex, payload.content);
                break;
            default:
                throw new Error(`Unknown operation: ${type}`);
        }
        self.postMessage({ id, success: true, result });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        self.postMessage({ id, success: false, error: error.message });
    }
};

async function deriveKey(password: string, salt: string | Uint8Array, iterations: number): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    let saltBuffer: Uint8Array;
    if (typeof salt === 'string') {
        // Hex string to Uint8Array check
        const match = salt.match(/.{1,2}/g);
        if (match && /^[0-9a-fA-F]+$/.test(salt)) {
             saltBuffer = new Uint8Array(match.map(byte => parseInt(byte, 16)));
        } else {
             // Legacy string salt
             saltBuffer = enc.encode(salt);
        }
    } else {
        saltBuffer = salt;
    }

    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltBuffer as BufferSource,
            iterations: iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptMessage(key: CryptoKey, content: string) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();

    const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        enc.encode(content)
    );

    return {
        iv: btoa(String.fromCharCode(...iv)),
        content: btoa(String.fromCharCode(...new Uint8Array(encryptedContent)))
    };
}

async function decryptMessage(key: CryptoKey, ivB64: string, contentB64: string) {
    try {
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const data = Uint8Array.from(atob(contentB64), c => c.charCodeAt(0));
        
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            data
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error("Decryption failed", e);
        return "[Decryption Failed]";
    }
}

async function sha256Hex(content: string): Promise<string> {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secretHex: string, content: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        hexToBytes(secretHex) as BufferSource,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content));
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) {
        throw new Error("Invalid hex input");
    }
    const match = hex.match(/.{2}/g) ?? [];
    return new Uint8Array(match.map(byte => parseInt(byte, 16)));
}

export {}; // Make this a module
