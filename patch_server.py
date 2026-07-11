import sys

with open("server.ts", "r", encoding="utf-8") as f:
    content = f.read()

# Fix order
content = content.replace(
'''    const { symbol, side, qty, price, leverage, marginMode = 'ISOLATED', stopLoss, takeProfit } = req.body;
    if (!symbol || !side || !qty || !price || !leverage) {
      return res.status(400).json({ error: "Missing required fields" });
    }''',
'''    const { symbol, side, qty, leverage, marginMode = 'ISOLATED', stopLoss, takeProfit } = req.body;
    if (!symbol || !side || !qty || !leverage) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const price = tickerPrices.get(symbol);
    if (!price) {
      return res.status(400).json({ error: "Market price not currently available for " + symbol });
    }'''
)

# Fix close
content = content.replace(
'''    const { symbol, closePrice } = req.body;
    if (!symbol || !closePrice) {
      return res.status(400).json({ error: "Missing required fields" });
    }''',
'''    const { symbol } = req.body;
    if (!symbol) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const closePrice = tickerPrices.get(symbol);
    if (!closePrice) {
      return res.status(400).json({ error: "Market price not currently available for " + symbol });
    }'''
)

# Fix Socket.IO init
content = content.replace(
'''  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" }
  });

  // Binance WebSocket connection for real-time pushing''',
'''  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*" }
  });

  io.engine.use(async (req: any, res: any, next: any) => {
    const isHandshake = req._query.sid === undefined;
    if (isHandshake) {
      const user = await getOptionalUser(req);
      if (user) {
        req.user = user;
      }
    }
    next();
  });

  io.on("connection", (socket: any) => {
    if (socket.request.user) {
      socket.join("user_" + socket.request.user.id);
    }
  });

  // Binance WebSocket connection for real-time pushing'''
)

# Fix Socket.IO emits
content = content.replace(
'''io.emit("position_liquidated", { userId: pos.user_id, symbol: pos.symbol, side: pos.side, liqPrice, price: currentPrice, newBalance });''',
'''io.to("user_" + pos.user_id).emit("position_liquidated", { userId: pos.user_id, symbol: pos.symbol, side: pos.side, liqPrice, price: currentPrice, newBalance });'''
)

content = content.replace(
'''io.emit("position_closed_auto", { userId: pos.user_id, symbol: pos.symbol, type, triggerPrice, pnl, newBalance });''',
'''io.to("user_" + pos.user_id).emit("position_closed_auto", { userId: pos.user_id, symbol: pos.symbol, type, triggerPrice, pnl, newBalance });'''
)

content = content.replace(
'''io.emit("funding_applied", { 
            userId: pos.user_id, 
            symbol: pos.symbol, 
            feeAmount, 
            fundingRate,
            newBalance 
          });''',
'''io.to("user_" + pos.user_id).emit("funding_applied", { 
            userId: pos.user_id, 
            symbol: pos.symbol, 
            feeAmount, 
            fundingRate,
            newBalance 
          });'''
)

with open("server.ts", "w", encoding="utf-8") as f:
    f.write(content)

print("Patch applied")
