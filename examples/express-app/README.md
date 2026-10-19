# NexKit Express example

A small Express 5 application wired with NexKit. The files `src/config/env.ts` and
`src/nexkit.ts` were generated with `nexkit init --framework express` and are
verified against the CLI templates by the CLI test-suite.

```bash
npm run build          # from the repository root — examples consume built packages
cp examples/express-app/.env.example examples/express-app/.env
npm run dev --workspace examples/express-app
```

Try it:

```bash
curl -i localhost:3000/users?pageSize=1
curl -i -X POST localhost:3000/users -H 'content-type: application/json' -d '{"name":"Linus","email":"linus@example.com"}'
curl -i localhost:3000/users/1/crash      # 500 with a safe body; details are in the logs
curl -i localhost:3000/health/ready
```
