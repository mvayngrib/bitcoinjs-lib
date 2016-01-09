var assert = require('assert')
var base58check = require('bs58check')
var ecdsa = require('./ecdsa')
var networks = require('./networks')
var randomBytes = require('randombytes')
var typeForce = require('typeforce')

var BigInteger = require('bigi')
var ECPubKey = require('./ecpubkey')

var ecurve = require('ecurve')
var secp256k1 = ecurve.getCurveByName('secp256k1')

function ECKey (d, compressed) {
  assert(d.signum() > 0, 'Private key must be greater than 0')
  assert(d.compareTo(ECKey.curve.n) < 0, 'Private key must be less than the curve order')

  this.d = d
  this.compressed = compressed
}

// Constants
ECKey.curve = secp256k1

Object.defineProperty(ECKey.prototype, 'pub', {
  get: function () {
    if (!this.__pub && this.d) {
      var Q = ECKey.curve.G.multiply(this.d)
      this.__pub = new ECPubKey(Q, this.compressed)
    }

    return this.__pub
  }
})

// Static constructors
ECKey.fromWIF = function (string) {
  var payload = base58check.decode(string)
  var compressed = false

  // Ignore the version byte
  payload = payload.slice(1)

  if (payload.length === 33) {
    assert.strictEqual(payload[32], 0x01, 'Invalid compression flag')

    // Truncate the compression flag
    payload = payload.slice(0, -1)
    compressed = true
  }

  assert.equal(payload.length, 32, 'Invalid WIF payload length')

  var d = BigInteger.fromBuffer(payload)
  return new ECKey(d, compressed)
}

ECKey.makeRandom = function (compressed, rng, callback) {
  rng = rng || randomBytes

  var async = !!callback
  return rand(32, function (err, buffer) {
    if (err) {
      if (async) return callback(err)
      else throw err
    }

    typeForce('Buffer', buffer)
    assert.equal(buffer.length, 32, 'Expected 256-bit Buffer from RNG')

    var d = BigInteger.fromBuffer(buffer)
    d = d.mod(ECKey.curve.n)

    var key = new ECKey(d, compressed)
    if (callback) callback(null, key)

    return key
  })

  function rand (size, rCallback) {
    // async
    if (!async) return rCallback(null, rng(size))

    rng(size, function (err, bytes) {
      rCallback(err, bytes)
    })
  }
}

// Export functions
ECKey.prototype.toWIF = function (network) {
  network = network || networks.bitcoin

  var bufferLen = this.pub.compressed ? 34 : 33
  var buffer = new Buffer(bufferLen)

  buffer.writeUInt8(network.wif, 0)
  this.d.toBuffer(32).copy(buffer, 1)

  if (this.pub.compressed) {
    buffer.writeUInt8(0x01, 33)
  }

  return base58check.encode(buffer)
}

// Operations
ECKey.prototype.sign = function (hash) {
  return ecdsa.sign(ECKey.curve, hash, this.d)
}

module.exports = ECKey
