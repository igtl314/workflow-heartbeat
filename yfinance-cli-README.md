# yfinance CLI

A command-line interface for accessing Yahoo Finance data using the [yfinance](https://github.com/ranaroussi/yfinance) Python library.

## Features

- 📈 Get current stock prices
- 📊 Fetch historical market data
- 💼 Access company information
- 📑 Retrieve financial statements (income, balance sheet, cash flow)
- 💰 Track dividend history
- 🔄 View stock split history
- 👥 Get analyst recommendations
- 📉 Access options chains
- 🤖 Agent-friendly JSON output format

## Installation

1. Ensure you have Python 3.7 or higher installed
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Make the script executable (optional):

```bash
chmod +x yfinance-cli.py
```

## Quick Start

Get the current price of Apple stock:

```bash
python yfinance-cli.py price AAPL
```

Get historical data for Tesla over the past year:

```bash
python yfinance-cli.py history TSLA --period 1y
```

Get Microsoft's income statement:

```bash
python yfinance-cli.py financials MSFT --type income
```

## Commands

### `price` - Get Current Price

```bash
python yfinance-cli.py price <TICKER>
```

Returns the most recent price for a ticker.

**Example:**
```bash
python yfinance-cli.py price AAPL
```

### `history` - Get Historical Data

```bash
python yfinance-cli.py history <TICKER> [--period PERIOD] [--interval INTERVAL]
```

**Options:**
- `--period`: Time period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
- `--interval`: Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)

**Example:**
```bash
python yfinance-cli.py history AAPL --period 6mo --interval 1d
```

### `info` - Get Company Information

```bash
python yfinance-cli.py info <TICKER>
```

Returns comprehensive information about a company including market cap, sector, industry, and more.

**Example:**
```bash
python yfinance-cli.py info TSLA
```

### `financials` - Get Financial Statements

```bash
python yfinance-cli.py financials <TICKER> [--type TYPE]
```

**Options:**
- `--type`: Statement type (income, balance, cashflow)

**Example:**
```bash
python yfinance-cli.py financials MSFT --type balance
```

### `dividends` - Get Dividend History

```bash
python yfinance-cli.py dividends <TICKER>
```

Returns historical dividend payments.

**Example:**
```bash
python yfinance-cli.py dividends KO
```

### `splits` - Get Stock Split History

```bash
python yfinance-cli.py splits <TICKER>
```

Returns historical stock splits.

**Example:**
```bash
python yfinance-cli.py splits AAPL
```

### `recommendations` - Get Analyst Recommendations

```bash
python yfinance-cli.py recommendations <TICKER>
```

Returns analyst recommendations and ratings.

**Example:**
```bash
python yfinance-cli.py recommendations GOOGL
```

### `options` - Get Options Data

```bash
python yfinance-cli.py options <TICKER> [--expiration DATE]
```

**Options:**
- `--expiration`: Expiration date in YYYY-MM-DD format (optional)

**Example:**
```bash
python yfinance-cli.py options SPY --expiration 2024-12-20
```

## Output Formats

All commands support two output formats:

- `--format json` (default): Machine-readable JSON output
- `--format text`: Human-readable text output

**Example:**
```bash
python yfinance-cli.py price AAPL --format text
```

## Supported Tickers

The CLI supports any ticker symbol available on Yahoo Finance:

- **US Stocks**: AAPL, GOOGL, MSFT, TSLA, etc.
- **International Stocks**: 0700.HK, SAP.DE, etc.
- **ETFs**: SPY, QQQ, VOO, etc.
- **Indices**: ^GSPC (S&P 500), ^DJI (Dow Jones), ^IXIC (NASDAQ)
- **Cryptocurrencies**: BTC-USD, ETH-USD, etc.
- **Currencies**: EURUSD=X, GBPUSD=X, etc.

## Usage with Agents

This CLI is designed to be easily integrated with AI agents and automation tools. The default JSON output format makes it simple to parse and process data programmatically.

For detailed agent integration examples and use cases, see [SKILL.md](SKILL.md).

## Error Handling

The CLI uses standard exit codes:
- `0`: Success
- `1`: Error (invalid ticker, network issues, missing data, etc.)

Error messages are written to stderr.

## Examples

### Get multiple data points for a stock:

```bash
# Current price
python yfinance-cli.py price AAPL

# Company info
python yfinance-cli.py info AAPL

# Historical data
python yfinance-cli.py history AAPL --period 1y --interval 1wk

# Dividends
python yfinance-cli.py dividends AAPL
```

### Compare stocks (in a script):

```bash
for ticker in AAPL GOOGL MSFT; do
  echo "Price for $ticker:"
  python yfinance-cli.py price $ticker
done
```

### Get S&P 500 data:

```bash
python yfinance-cli.py history ^GSPC --period 1y
```

### Get cryptocurrency price:

```bash
python yfinance-cli.py price BTC-USD
```

## Requirements

- Python 3.7+
- yfinance >= 0.2.36
- pandas >= 2.0.0

## License

MIT License - See LICENSE file for details.

This tool uses the yfinance library which accesses publicly available data from Yahoo Finance. Please ensure compliance with Yahoo Finance's terms of service.

## Troubleshooting

**Problem**: "yfinance is not installed" error
**Solution**: Run `pip install -r requirements.txt`

**Problem**: No data available for ticker
**Solution**: Verify the ticker symbol is correct and exists on Yahoo Finance

**Problem**: Rate limiting errors
**Solution**: Add delays between requests or reduce request frequency

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Related Projects

- [yfinance](https://github.com/ranaroussi/yfinance) - The underlying Python library
- [OpenClaw](https://github.com/openclaw) - Agent framework that can use this CLI

## Acknowledgments

This CLI is built on top of the excellent [yfinance](https://github.com/ranaroussi/yfinance) library by Ran Aroussi.
