import test from 'node:test'
import assert from 'node:assert/strict'
import { photoExtension, verifyPhoto } from '../src/photos.js'

test('photo types are detected from content rather than filename', () => {
  assert.equal(photoExtension(Buffer.from('89504e470d0a1a0a00000000', 'hex')), 'png')
  assert.equal(photoExtension(Buffer.from('ffd8ffe00000000000000000', 'hex')), 'jpg')
  assert.equal(photoExtension(Buffer.from('RIFF0000WEBP')), 'webp')
})

test('unsupported files and empty uploads are rejected', () => {
  for (const value of [undefined, {}, Buffer.alloc(0), Buffer.from('<svg onload="alert(1)"></svg>'), Buffer.from('This is not an image')]) {
    assert.throws(() => photoExtension(value), { status: 400 })
  }
})

test('photo references cannot point to remote URLs or arbitrary files', async () => {
  await verifyPhoto(null)
  for (const url of ['https://example.com/image.png', '/api/uploads/photos/../../.env', '/api/uploads/photos/test.svg']) {
    await assert.rejects(verifyPhoto(url), { status: 400 })
  }
})
