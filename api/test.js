module.exports = function handler(req, res) {
  res.status(200).json({ 
    ok: true, 
    hasKey: !!process.env.ANTHROPIC_API_KEY 
  });
};