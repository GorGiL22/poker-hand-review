# poker-hand-review

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Google Cloud Storage uploads (signed URLs)

Set these environment variables (Vercel or `.env.local`):

```bash
GCS_BUCKET_NAME=your-bucket
GCS_PROJECT_ID=your-project-id
GCS_CLIENT_EMAIL=service-account@your-project.iam.gserviceaccount.com
GCS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

API routes added:

- `POST /api/storage/presign-upload` with `{ filename, contentType, folder?, expiresInMinutes? }`
- `POST /api/storage/presign-download` with `{ objectKey, downloadName?, expiresInMinutes? }`

Upload flow:

1. Call `presign-upload`.
2. `PUT` file to `uploadUrl` with the returned `contentType`.
3. Store returned `objectKey` in your database.

Download flow:

1. Call `presign-download` with `objectKey`.
2. Redirect user to `downloadUrl` or `fetch` it from backend.
