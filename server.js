const express = require('express');
const { McpServer, SSEServerTransport } = require('@modelcontextprotocol/sdk');
const z = require('zod');

// 初始化 MCP 服务器
const server = new McpServer({
  name: 'csgo-price-server',
  version: '1.0.0'
});

// 工具：查询单一饰品价格
server.tool(
  'get_skin_price',
  '查询 Counter-Strike 2 饰品当前最低价（来源：Steam 市场）',
  {
    name: z.string().describe('饰品完整名称，如 "AK-47 | Redline (Field-Tested)"')
  },
  async ({ name }) => {
    try {
      const response = await fetch(
        `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${encodeURIComponent(name)}`
      );
      const data = await response.json();
      if (!data.success) return { error: '未找到该饰品' };
      return {
        name,
        lowest_price: data.lowest_price || '未知',
        volume: data.volume || '0'
      };
    } catch (e) {
      return { error: e.message };
    }
  }
);

const app = express();

// SSE 端点
app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);
});

// 消息端点（SSE 双向通信需要）
app.post('/message', async (req, res) => {
  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MCP server running on port ${PORT}`);
});