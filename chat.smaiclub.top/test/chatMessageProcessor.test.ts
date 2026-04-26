import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIncomingChatMessage } from '../src/hooks/chatMessageProcessor.ts';

test('cleanup system payload with SYSTEM iv is not decrypted', async () => {
    let decryptCalls = 0;

    const message = await parseIncomingChatMessage(
        {
            iv: 'SYSTEM',
            content: 'Old messages were cleaned up automatically.',
            sender: 'SYSTEM',
            timestamp: 1710000000000
        },
        {
            roomId: 26001,
            username: 'preview_user',
            decrypt: async () => {
                decryptCalls += 1;
                throw new Error('decryption failed');
            }
        }
    );

    assert.equal(decryptCalls, 0);
    assert.deepEqual(message, {
        id: 1710000000000,
        roomId: 26001,
        content: 'Old messages were cleaned up automatically.',
        sender: 'SYSTEM',
        isMine: false,
        timestamp: 1710000000000,
        system: true
    });
});

test('live system payload is not decrypted', async () => {
    let decryptCalls = 0;

    const message = await parseIncomingChatMessage(
        {
            type: 'system',
            content: 'Cleanup finished.',
            timestamp: 1710000000100
        },
        {
            roomId: 26001,
            username: 'preview_user',
            decrypt: async () => {
                decryptCalls += 1;
                throw new Error('decryption failed');
            }
        }
    );

    assert.equal(decryptCalls, 0);
    assert.equal(message?.system, true);
    assert.equal(message?.content, 'Cleanup finished.');
});

test('encrypted user payload still decrypts content', async () => {
    const calls: Array<[string, string]> = [];

    const message = await parseIncomingChatMessage(
        {
            iv: 'encrypted-iv',
            content: 'encrypted-content',
            sender: 'alice',
            senderRole: 'vip',
            timestamp: 1710000000200
        },
        {
            roomId: 26001,
            username: 'preview_user',
            decrypt: async (iv, content) => {
                calls.push([iv, content]);
                return 'hello';
            }
        }
    );

    assert.deepEqual(calls, [['encrypted-iv', 'encrypted-content']]);
    assert.equal(message?.content, 'hello');
    assert.equal(message?.sender, 'alice');
    assert.equal(message?.system, undefined);
});
