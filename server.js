const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { z } = require('zod');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

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
      const response = await fetch(pricingUrl); // 直接用 Node 18+ 自带的 fetch
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

let transport;

app.get("/sse", async (req, res) => {
  console.log("New SSE connection");
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(503).send("No active SSE transport");
  }
});

app.listen(PORT, () => {
  console.log(`CS:GO MCP server running on port ${PORT}`);
});
