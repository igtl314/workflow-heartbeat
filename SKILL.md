# yfinance CLI Skill

## Description

A command-line interface for accessing Yahoo Finance data using the yfinance Python library. This skill enables agents to fetch stock prices, historical data, financial statements, dividends, analyst recommendations, and options data.

## Installation

```bash
pip install -r requirements.txt
chmod +x yfinance-cli.py
```

## Usage

The CLI provides several commands for accessing different types of financial data:

### Get Current Price

```bash
python yfinance-cli.py price <TICKER>
```

**Example:**
```bash
python yfinance-cli.py price AAPL
```

**Output:**
```json
{
  "ticker": "AAPL",
  "price": 175.43,
  "timestamp": "2024-01-15 15:59:00-05:00"
}
```

### Get Historical Data

```bash
python yfinance-cli.py history <TICKER> [--period PERIOD] [--interval INTERVAL]
```

**Parameters:**
- `--period`: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max (default: 1mo)
- `--interval`: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo (default: 1d)

**Example:**
```bash
python yfinance-cli.py history AAPL --period 1y --interval 1d
```

**Output:**
```json
[
  {
    "Date": "2023-01-15",
    "Open": 174.5,
    "High": 176.2,
    "Low": 173.8,
    "Close": 175.43,
    "Volume": 50000000
  },
  ...
]
```

### Get Company Information

```bash
python yfinance-cli.py info <TICKER>
```

**Example:**
```bash
python yfinance-cli.py info TSLA
```

**Output:**
```json
{
  "symbol": "TSLA",
  "shortName": "Tesla, Inc.",
  "longName": "Tesla, Inc.",
  "sector": "Consumer Cyclical",
  "industry": "Auto Manufacturers",
  "marketCap": 850000000000,
  "previousClose": 245.67,
  "regularMarketPrice": 248.5,
  ...
}
```

### Get Financial Statements

```bash
python yfinance-cli.py financials <TICKER> [--type TYPE]
```

**Parameters:**
- `--type`: income, balance, cashflow (default: income)

**Example:**
```bash
python yfinance-cli.py financials MSFT --type income
```

**Output:** JSON representation of the income statement

### Get Dividend History

```bash
python yfinance-cli.py dividends <TICKER>
```

**Example:**
```bash
python yfinance-cli.py dividends KO
```

**Output:**
```json
[
  {
    "Date": "2023-12-15",
    "Dividends": 0.46
  },
  ...
]
```

### Get Stock Split History

```bash
python yfinance-cli.py splits <TICKER>
```

**Example:**
```bash
python yfinance-cli.py splits AAPL
```

### Get Analyst Recommendations

```bash
python yfinance-cli.py recommendations <TICKER>
```

**Example:**
```bash
python yfinance-cli.py recommendations GOOGL
```

### Get Options Data

```bash
python yfinance-cli.py options <TICKER> [--expiration DATE]
```

**Parameters:**
- `--expiration`: Expiration date in YYYY-MM-DD format (optional, uses nearest if not specified)

**Example:**
```bash
python yfinance-cli.py options SPY --expiration 2024-12-20
```

**Output:**
```json
{
  "expiration": "2024-12-20",
  "calls": [...],
  "puts": [...]
}
```

## Output Formats

All commands support two output formats:

- `--format json` (default): Machine-readable JSON output
- `--format text`: Human-readable text output

**Example:**
```bash
python yfinance-cli.py price AAPL --format text
```

## Agent Integration

This CLI is designed to be easily integrated with AI agents and automation tools. All commands return structured JSON by default, making it simple to parse and process the data programmatically.

### Common Use Cases for Agents

1. **Portfolio Monitoring**: Track multiple stocks and get real-time prices
2. **Market Analysis**: Fetch historical data for trend analysis
3. **Financial Research**: Access financial statements and company information
4. **Options Trading**: Analyze options chains for specific expiration dates
5. **Dividend Tracking**: Monitor dividend payments for income strategies

### Error Handling

The CLI exits with non-zero status codes on errors and provides error messages on stderr:

- Exit code 0: Success
- Exit code 1: Error (missing data, invalid ticker, network issues, etc.)

### Example Agent Workflow

```python
import subprocess
import json

# Get current price
result = subprocess.run(
    ['python', 'yfinance-cli.py', 'price', 'AAPL'],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    data = json.loads(result.stdout)
    price = data['price']
    print(f"Apple stock price: ${price}")
else:
    print(f"Error: {result.stderr}")
```

## Supported Tickers

The CLI supports any ticker symbol available on Yahoo Finance, including:
- US stocks (e.g., AAPL, GOOGL, MSFT)
- International stocks (e.g., 0700.HK, SAP.DE)
- ETFs (e.g., SPY, QQQ, VOO)
- Indices (e.g., ^GSPC for S&P 500, ^DJI for Dow Jones)
- Cryptocurrencies (e.g., BTC-USD, ETH-USD)
- Currencies (e.g., EURUSD=X)

## Limitations

- Data is subject to Yahoo Finance availability and may have delays
- Some data types may not be available for all tickers
- Historical data intervals and periods have restrictions based on the time range
- Options data is only available for optionable securities

## Troubleshooting

**Issue**: "yfinance is not installed" error
**Solution**: Run `pip install -r requirements.txt`

**Issue**: No data returned for a ticker
**Solution**: Verify the ticker symbol is correct and available on Yahoo Finance

**Issue**: Rate limiting or connection errors
**Solution**: Add delays between requests or check your internet connection

## License

This tool uses the yfinance library which accesses publicly available data from Yahoo Finance. Ensure compliance with Yahoo Finance's terms of service.
