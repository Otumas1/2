import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

// ⚠️ 关键：解析 JSON 请求体
app.use(express.json());

const transports = new Map();

function createServer() {
  const server = new McpServer({
    name: "csgo-skin-price",
    version: "1.0.0",
    description: "Query CS:GO skin prices from Steam",
  });

  server.tool(
    "get_skin_price",
    "Get the current price and volume of a CS:GO skin from the Steam Community Market.",
    {
      skin_name: z.string().describe("Full market hash name, e.g. 'AK-47 | Redline (Field-Tested)'"),
    },
    async ({ skin_name }) => {
      const pricingUrl = `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodeURIComponent(skin_name)}`;
      const listingUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(skin_name)}`;

      try {
        const response = await fetch(pricingUrl);
        if (!response.ok) throw new Error("Market API unreachable");
        const data = await response.json();

        if (!data || !data.success) {
          return {
            content: [{ type: "text", text: `Could not find price for "${skin_name}". Check the name.` }],
          };
        }

        const result = {
          name: skin_name,
          lowest_price: data.lowest_price || "N/A",
          median_price: data.median_price || "N/A",
          volume: data.volume || "N/A",
          listing_url: listingUrl,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error fetching price: ${err.message}` }],
        };
      }
    }
  );

  return server;
}

app.get("/sse", async (req, res) => {
  console.log("New SSE connection");
  const transport = new SSEServerTransport("/messages", res);
  const server = createServer();

  const sessionId = transport.sessionId;
  transports.set(sessionId, transport);

  transport.onclose = () => {
    transports.delete(sessionId);
  };

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  console.log("POST /messages, sessionId:", sessionId, "body:", req.body);

  if (!sessionId) {
    return res.status(400).send("Missing sessionId");
  }
  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(503).send("No active SSE transport for this session");
  }

  // 传递解析后的 body，避免内部再去读流（已被 express.json 消费）
  await transport.handlePostMessage(req, res, req.body);
});

app.get("/", (req, res) => {
  res.send("CS:GO MCP Server is running.");
});

app.listen(PORT, () => {
  console.log(`CS:GO MCP server running on port ${PORT}`);
});
