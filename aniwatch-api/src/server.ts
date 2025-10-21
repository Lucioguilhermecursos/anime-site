import https from "https";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors"; // ✅ Ativa CORS

import { log } from "./config/logger.js";
import { corsConfig } from "./config/cors.js";
import { ratelimit } from "./config/ratelimit.js";
import { execGracefulShutdown } from "./utils.js";
import { DeploymentEnv, env, SERVERLESS_ENVIRONMENTS } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./config/errorHandler.js";
import type { ServerContext } from "./config/context.js";
import fetch from "node-fetch";

import { hianimeRouter } from "./routes/hianime.js";
import { logging } from "./middleware/logging.js";
import { cacheConfigSetter, cacheControl } from "./middleware/cache.js";

import pkgJson from "../package.json" with { type: "json" };

const BASE_PATH = "/api/v2" as const;

// ✅ Cria o app principal
const app = new Hono<ServerContext>();

// ✅ Ativa o CORS globalmente (libera acesso do navegador ao backend)
app.use("*", cors());

// Middlewares padrão
app.use(logging);
app.use(corsConfig);
app.use(cacheControl);

/*
    CAUTION: 
    Having the "ANIWATCH_API_HOSTNAME" env will
    enable rate limitting for the deployment.
    WARNING:
    If you are using any serverless environment, you must set the
    "ANIWATCH_API_DEPLOYMENT_ENV" to that environment's name, 
    otherwise you may face issues.
*/
const isPersonalDeployment = Boolean(env.ANIWATCH_API_HOSTNAME);
if (isPersonalDeployment) {
    app.use(ratelimit);
}

// if (env.ANIWATCH_API_DEPLOYMENT_ENV === DeploymentEnv.NODEJS) {
app.use("/", serveStatic({ root: "public" }));
// }

app.get("/health", (c) => c.text("daijoubu", { status: 200 }));
app.get("/v", async (c) =>
    c.text(
        `aniwatch-api: v${"version" in pkgJson && pkgJson?.version ? pkgJson.version : "-1"}\n` +
            `aniwatch-package: v${"dependencies" in pkgJson && pkgJson?.dependencies?.aniwatch ? pkgJson?.dependencies?.aniwatch : "-1"}`
    )
);

app.use(cacheConfigSetter(BASE_PATH.length));

app.basePath(BASE_PATH).route("/hianime", hianimeRouter);
app.basePath(BASE_PATH).get("/anicrush", (c) =>
    c.text("Anicrush could be implemented in future.")
);

app.notFound(notFoundHandler);
app.onError(errorHandler);

(function () {
    if (SERVERLESS_ENVIRONMENTS.includes(env.ANIWATCH_API_DEPLOYMENT_ENV)) {
        return;
    }

    const server = serve({
        port: env.ANIWATCH_API_PORT,
        fetch: app.fetch,
    }).addListener("listening", () =>
        log.info(
            `aniwatch-api RUNNING at http://localhost:${env.ANIWATCH_API_PORT}`
        )
    );

    process.on("SIGINT", () => execGracefulShutdown(server));
    process.on("SIGTERM", () => execGracefulShutdown(server));
    process.on("uncaughtException", (err) => {
        log.error(`Uncaught Exception: ${err.message}`);
        execGracefulShutdown(server);
    });
    process.on("unhandledRejection", (reason, promise) => {
        log.error(
            `Unhandled Rejection at: ${promise}, reason: ${reason instanceof Error ? reason.message : reason}`
        );
        execGracefulShutdown(server);
    });

    if (
        isPersonalDeployment &&
        env.ANIWATCH_API_DEPLOYMENT_ENV === DeploymentEnv.RENDER
    ) {
        const INTERVAL_DELAY = 8 * 60 * 1000; // 8mins
        const url = new URL(`https://${env.ANIWATCH_API_HOSTNAME}/health`);

                // Mantém o servidor ativo
        setInterval(() => {
            https
                .get(url.href)
                .on("response", () => {
                    log.info(
                        `aniwatch-api HEALTH_CHECK at ${new Date().toISOString()}`
                    );
                })
                .on("error", (err) => {
                    log.warn(
                        `aniwatch-api HEALTH_CHECK failed; ${err.message.trim()}`
                    );
                });
        }, INTERVAL_DELAY);
    }
    


// --- ROTA DE PROXY INTELIGENTE PARA PLAYER DO HIANIME ---
app.get("/proxy/:slug", async (c) => {
  try {
    const slug = c.req.param("slug");
    const ep = c.req.query("ep");

    if (!slug || !ep) {
      return c.text("Slug ou episódio ausente.", 400);
    }

    const remoteUrl = `https://hianime.to/watch/${slug}?ep=${ep}`;
    const response = await fetch(remoteUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      return c.text("Falha ao acessar o player remoto.", 500);
    }

    let html = await response.text();

    // 🔧 Reescreve caminhos relativos (CSS, JS, imagens) para absolutos
    html = html.replace(/(href|src)="\/(.*?)"/g, (_, attr, path) => {
      return `${attr}="https://hianime.to/${path}"`;
    });

    // 🔧 Remove partes indesejadas (menus, rodapés)
    html = html.replace(/<header[\s\S]*?<\/header>/gi, "");
    html = html.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    html = html.replace(/<nav[\s\S]*?<\/nav>/gi, "");

    // 🔧 Injeta estilo para fullscreen
    html += `
      <style>
        html,body {
          margin: 0;
          padding: 0;
          background: #000;
          height: 100%;
          overflow: hidden;
        }
        video,iframe {
          width: 100%;
          height: 100%;
          border: none;
        }
      </style>
    `;

    // ✅ Retorna o HTML modificado
    return c.html(html);

  } catch (err) {
    console.error("Erro no proxy inteligente:", err);
    return c.text("Erro interno no proxy.", 500);
  }
});

})();


