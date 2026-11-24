/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@cavos/kit"],
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Cavos vault iframe + enclave / auth endpoints
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vault.cavos.xyz https://cavos.xyz",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://cavos.xyz https://vault.cavos.xyz https://enclave.cavos.xyz https://tuf-repo-cdn.sigstore.dev https: wss:",
              "frame-src 'self' https://vault.cavos.xyz https://accounts.google.com https://appleid.apple.com",
              "child-src 'self' https://vault.cavos.xyz",
              "worker-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
