/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/',
        destination: '/api/html',
      },
    ];
  },
};

module.exports = nextConfig;
