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
            case 'pbkdf2Hex':
                result = await pbkdf2Hex(payload.password, payload.salt, payload.iterations);
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

    const saltBuffer = saltToBytes(salt);

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

async function pbkdf2Hex(password: string, salt: string | Uint8Array, iterations: number): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: saltToBytes(salt) as BufferSource, iterations, hash: "SHA-256" },
        keyMaterial,
        256
    );
    return bytesToHex(new Uint8Array(bits));
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
        throw new Error("DECRYPTION_FAILED");
    }
}

async function sha256Hex(content: string): Promise<string> {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    return bytesToHex(new Uint8Array(buffer));
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
    return bytesToHex(new Uint8Array(signature));
}

function hexToBytes(hex: string): Uint8Array {
    if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) {
        throw new Error("Invalid hex input");
    }
    const match = hex.match(/.{2}/g) ?? [];
    return new Uint8Array(match.map(byte => parseInt(byte, 16)));
}

function saltToBytes(salt: string | Uint8Array): Uint8Array {
    if (typeof salt !== 'string') return salt;
    if (/^(?:[0-9a-fA-F]{2})+$/.test(salt)) {
        return hexToBytes(salt);
    }
    return new TextEncoder().encode(salt);
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export {}; // Make this a module
