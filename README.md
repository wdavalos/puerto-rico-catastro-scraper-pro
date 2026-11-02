# Puerto Rico Catastro Scraper Pro

Property records for Puerto Rico from the official CRIM Catastro Digital (catastro.crimpr.net): owner of record, mailing address, assessed values, lot size, deed reference and last sale for any parcel on the island, across all 78 municipalities.

**Use cases:** off-market lead generation (owner + mailing address for direct mail), absentee-owner lists, vacant land sourcing, comp and sale-history research, title and paralegal parcel lookup, agent prospecting by municipality.

**Input: 1 catastro number, owner name, municipality, or map area. Output: clean structured rows.**

## Compared to other Puerto Rico property data options

| | Puerto Rico Catastro Scraper Pro | Single-parcel report sites (e.g. ZonasPR) | Manual CRIM portal |
|---|---|---|---|
| Records per run | Up to 20,000 parcels, bulk | 1 property | 1 parcel |
| Price | $5 per 1,000 parcels | ~$9.99 per property report | free but slow, 1 at a time |
| Owner + mailing address | Yes | Yes (paid report) | Yes (one parcel at a time) |
| Sale history (price, date, seller, buyer) | Yes | Yes (paid report) | Partial |
| Automation / API | Apify actor, API, scheduling | No | No |
| Zoning + flood overlays | No | Yes | No |

## Input options

| Field | Description |
|---|---|
| Search mode | Catastro numbers, owner name, municipality, area (bounding box or center + radius), or custom WHERE clause |
| Catastro numbers | Accepts 11-digit parcel form, full 14-digit with unit block, with or without dashes |
| Owner name | Owner of record contains this text (case-insensitive) |
| Municipality | e.g. San Juan, Ponce, Bayamón, Río Grande |
| Area | Bounding box (west/south/east/north) or centerLat/centerLon + radiusKm |
| Filters | Only parcels with a recorded sale, sale year range, with/without structures, absentee owners only, min/max assessed value, min/max lot size, parcel type |
| Max results | Up to 20,000 parcels per run |
| Include geometry | Optionally return each parcel polygon as GeoJSON |

## Output fields

| Field | Description |
|---|---|
| catastroNumber | CRIM catastro number, parcel form (11 digits) |
| catastroFull | 14-digit form including the unit block when divided |
| municipality, parcelType | Municipality name; TIPO: P = parcela, V = vial, A = agua |
| owner | Taxpayer of record at CRIM |
| physicalAddress, mailingAddress | Parcel address; owner's address on file with CRIM |
| lotSizeM2 | Cabida (lot area) |
| landValue, structureValue, machineryValue, totalAssessedValue, taxableValue, exemption | CRIM assessed values. These are tax bases, not market values, and in Puerto Rico they typically sit far below what a property would sell for |
| deed | Tomo / folio / finca / escritura as recorded by CRIM |
| lastSalePrice, lastSaleDate, seller, buyer | Last transfer recorded by CRIM |
| latitude, longitude, sourceUrl | Parcel point and a link to the parcel in the CRIM viewer |
| geometry | Parcel polygon (GeoJSON), when enabled |

## Usage

**Absentee owners with recent sales in Rincón:**
```json
{ "searchMode": "municipality", "municipio": "Rincon", "hasSale": true, "saleYearFrom": "2015", "maxItems": 2000 }
```

**Look up specific parcels:**
```json
{ "searchMode": "catastro_numbers", "catastroNumbers": ["401-007-382-02", "38906250641"] }
```

**Radius search around coordinates:**
```json
{ "searchMode": "area", "centerLat": "18.4663", "centerLon": "-66.1057", "radiusKm": "2", "maxItems": 500 }
```

## FAQ

**Is the owner data public?** Yes. Property ownership is public record in Puerto Rico. CRIM, the municipal revenue center, publishes the taxpayer of record for every assessed parcel. This actor automates that public data.

**Is the CRIM owner the legal owner?** Usually, but not necessarily. CRIM records whoever pays the property tax and updates after the deed is recorded, so a recently sold property can still show the previous owner. The legal owner is the one recorded in the Registro de la Propiedad.

**What is a catastro number?** The unique 14-digit identifier CRIM assigns to each parcel for tax purposes: XXX-XXX-XXX-XX-XXX. The first 11 digits identify the parcel; the last 3 identify the unit within it (000 when the parcel is not divided). The actor accepts both forms.

**Are assessed values market values?** No. The CRIM assessed value is a tax base, not a market value, and it typically sits far below what the property would sell for. Use it for tax and record purposes, not pricing.

**How current is the data?** CRIM updates the parcel map continuously from service filings submitted to its offices. Some recent sales or subdivisions can take weeks or months to appear.

**Does the actor search by deed?** The output includes the deed reference (tomo, folio, finca, escritura) recorded for each parcel. The finca number is assigned by the Registro de la Propiedad, which is a separate registry from CRIM.

**How much does it cost?** Pay per result: $0.005 per run start and $0.005 per parcel returned. 1,000 parcels cost $5.00.

## Links

- [Apify Store listing](https://apify.com/wdavalos/puerto-rico-catastro-scraper-pro)
- [ScraperFleet page](https://scraperfleet.com/actors/puerto-rico-catastro-scraper-pro/)
