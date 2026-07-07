const path = require('path')

module.exports = function (options) {
  return {
    ...options,
    externals: [
      function (data, callback) {
        const request = typeof data === 'string' ? data : data && data.request
        if (!request || typeof request !== 'string') return callback()
        // @autobid/* 워크스페이스 패키지는 번들에 포함
        if (request.startsWith('@autobid/')) return callback()
        // node_modules는 외부 처리
        if (/^[a-zA-Z@]/.test(request) && !request.startsWith('.') && !path.isAbsolute(request)) {
          return callback(null, 'commonjs ' + request)
        }
        callback()
      },
    ],
    resolve: {
      ...options.resolve,
      alias: {
        '@autobid/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
  }
}
