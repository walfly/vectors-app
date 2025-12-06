This repository contains a [Next.js](https://nextjs.org) project under `apps/web`, bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

This project uses **pnpm** as the recommended package manager.

From the repository root, install dependencies:

```bash
pnpm install
```

Then either run the app from the app directory:

```bash
cd apps/web
pnpm dev
```

or use the workspace script from the repository root:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `apps/web/src/app/page.tsx`. The page auto-updates as you edit the file.

## Project structure

The app is built with the Next.js App Router using a `src/` directory and TypeScript in strict mode. The main application files live under `apps/web`. Key folders:

```text
apps/web/src/
├── app/
│   ├── api/
│   │   └── embeddings/        # Route handler lives here
│   ├── layout.tsx
│   └── page.tsx
├── components/
├── lib/
│   ├── embeddings/
│   ├── vectors/
│   └── utils/
├── hooks/
└── types/
```

Path aliases are configured so imports like `@/components/...`, `@/lib/...`, and `@/types/...` resolve to the corresponding folders under `src/`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
