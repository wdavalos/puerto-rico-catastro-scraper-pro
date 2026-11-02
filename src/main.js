import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';

const PORTAL_ORIGIN = 'https://catastro.crimpr.net';
const LAYER_QUERY = `${PORTAL_ORIGIN}/server/rest/services/Parcelario/Parcelas/MapServer/654/query`;
const REFERER = `${PORTAL_ORIGIN}/cdprpc/`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PAGE = 2000;
const OUT_FIELDS = [
    'NUM_CATASTRO', 'CATASTRO', 'TIPO', 'MUNICIPIO', 'CONTACT',
    'DIRECCION_FISICA', 'DIRECCION_POSTAL', 'CABIDA', 'LAND', 'STRUCTURE',
    'MACHINERY', 'TOTALVAL', 'EXEMP', 'TAXABLE', 'DEEDBOOK', 'DEEDPAGE',
    'ESTATE', 'DEEDNUM', 'SALESAMT', 'SALESDTTM', 'SELLERNAME', 'BYERNAME',
    'INSIDE_X', 'INSIDE_Y',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/'/g, "''").trim();

function proxyUrl(params) {
    return `${PORTAL_ORIGIN}/proxy/proxy.ashx?${encodeURIComponent(`${LAYER_QUERY}?${params}`)}`;
}

async function arcQuery(params) {
    const res = await gotScraping({
        url: proxyUrl(params),
        headers: { Referer: REFERER, Accept: 'application/json,text/plain,*/*' },
        responseType: 'json',
        timeout: { request: 120000 },
        retry: { limit: 3 },
    });
    const body = res.body;
    if (body && body.error) {
        throw new Error(`CRIM service error: ${JSON.stringify(body.error).slice(0, 300)}`);
    }
    return body;
}

// XXX-XXX-XXX-XX(-XXX): 11 digits = parcel, 14 = parcel + unit block.
function normCatastro(raw) {
    const s = String(raw).trim();
    const d = s.replace(/[^0-9]/g, '');
    if (d.length === 11) {
        return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}-${d.slice(9, 11)}`;
    }
    if (d.length === 14) {
        return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)}-${d.slice(9, 11)}-${d.slice(11, 14)}`;
    }
    return s;
}

function cleanAddress(v) {
    if (v == null) return null;
    const parts = String(v).split(',').map((p) => p.trim()).filter((p) => p && p.toUpperCase() !== 'PR' && p.toUpperCase() !== 'PUERTO RICO');
    const joined = parts.join(', ');
    return joined ? joined.replace(/(\d{5})-$/, '$1') : null;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const str = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
};
const isoDate = (ms) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : null);

function mapFeature(f, includeGeometry) {
    const a = f.attributes || {};
    const lat = num(a.INSIDE_Y);
    const lon = num(a.INSIDE_X);
    const item = {
        catastroNumber: str(a.NUM_CATASTRO),
        catastroFull: str(a.CATASTRO),
        parcelType: str(a.TIPO),
        municipality: str(a.MUNICIPIO),
        owner: str(a.CONTACT),
        physicalAddress: cleanAddress(a.DIRECCION_FISICA),
        mailingAddress: cleanAddress(a.DIRECCION_POSTAL),
        lotSizeM2: num(a.CABIDA),
        landValue: num(a.LAND),
        structureValue: num(a.STRUCTURE),
        machineryValue: num(a.MACHINERY),
        totalAssessedValue: num(a.TOTALVAL),
        exemption: num(a.EXEMP),
        taxableValue: num(a.TAXABLE),
        deed: [
            a.DEEDBOOK != null && String(a.DEEDBOOK).trim() ? `tomo ${a.DEEDBOOK}` : null,
            a.DEEDPAGE != null && String(a.DEEDPAGE).trim() ? `folio ${a.DEEDPAGE}` : null,
            a.ESTATE != null && String(a.ESTATE).trim() ? `finca ${a.ESTATE}` : null,
            a.DEEDNUM != null && String(a.DEEDNUM).trim() ? `escritura ${a.DEEDNUM}` : null,
        ].filter(Boolean).join(', ') || null,
        lastSalePrice: num(a.SALESAMT) || null,
        lastSaleDate: isoDate(a.SALESDTTM),
        seller: str(a.SELLERNAME),
        buyer: str(a.BYERNAME),
        latitude: lat,
        longitude: lon,
        sourceUrl: lat != null && lon != null ? `${PORTAL_ORIGIN}/cdprpc/?find=${lon},${lat}` : `${PORTAL_ORIGIN}/cdprpc/`,
    };
    if (includeGeometry && f.geometry && Array.isArray(f.geometry.rings)) {
        item.geometry = { type: 'Polygon', coordinates: f.geometry.rings.map((ring) => ring.map(([x, y]) => [x, y])) };
    }
    return item;
}

function whereParts(input) {
    const parts = [];
    switch (input.searchMode) {
        case 'owner_name': {
            if (!input.ownerName) throw new Error('searchMode owner_name requires ownerName');
            parts.push(`UPPER(CONTACT) LIKE UPPER('%${esc(input.ownerName)}%')`);
            break;
        }
        case 'municipality': {
            if (!input.municipio) throw new Error('searchMode municipality requires municipio');
            parts.push(`UPPER(MUNICIPIO) = UPPER('${esc(input.municipio)}')`);
            break;
        }
        case 'custom': {
            if (!input.customWhere) throw new Error('searchMode custom requires customWhere');
            parts.push(`(${input.customWhere})`);
            break;
        }
        case 'catastro_numbers':
        case 'area':
        default:
            break;
    }
    if (input.parcelType) parts.push(`TIPO = '${esc(input.parcelType)}'`);
    if (input.hasSale) parts.push('SALESAMT > 0');
    if (input.saleYearFrom) parts.push(`SALESDTTM >= DATE '${parseInt(input.saleYearFrom, 10)}-01-01'`);
    if (input.saleYearTo) parts.push(`SALESDTTM < DATE '${parseInt(input.saleYearTo, 10) + 1}-01-01'`);
    if (input.hasStructure) parts.push('STRUCTURE > 0');
    if (input.vacantOnly) parts.push('(STRUCTURE = 0 OR STRUCTURE IS NULL)');
    if (input.absenteeOnly) parts.push("(DIRECCION_POSTAL IS NOT NULL AND DIRECCION_POSTAL <> '' AND DIRECCION_POSTAL <> DIRECCION_FISICA)");
    if (input.minTotalValue) parts.push(`TOTALVAL >= ${parseFloat(input.minTotalValue)}`);
    if (input.maxTotalValue) parts.push(`TOTALVAL <= ${parseFloat(input.maxTotalValue)}`);
    if (input.minCabidaM2) parts.push(`CABIDA >= ${parseFloat(input.minCabidaM2)}`);
    if (input.maxCabidaM2) parts.push(`CABIDA <= ${parseFloat(input.maxCabidaM2)}`);
    return parts;
}

function geometryParams(input) {
    let west = parseFloat(input.bboxWest), south = parseFloat(input.bboxSouth),
        east = parseFloat(input.bboxEast), north = parseFloat(input.bboxNorth);
    if (!isFinite(west) && input.centerLat != null && input.centerLon != null && input.radiusKm) {
        const lat = parseFloat(input.centerLat), lon = parseFloat(input.centerLon), r = parseFloat(input.radiusKm);
        if (!isFinite(lat) || !isFinite(lon) || !isFinite(r)) return null;
        const dLat = r / 111.32;
        const dLon = r / (111.32 * Math.max(Math.cos((lat * Math.PI) / 180), 0.05));
        west = lon - dLon; east = lon + dLon; south = lat - dLat; north = lat + dLat;
    }
    if (![west, south, east, north].every(isFinite)) return null;
    const geom = JSON.stringify({ xmin: west, ymin: south, xmax: east, ymax: north, spatialReference: { wkid: 4326 } });
    return { geometry: geom, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' };
}

Actor.main(async () => {
    const input = await Actor.getInput() || {};
    const maxItems = Math.max(1, Math.min(20000, parseInt(input.maxItems, 10) || 1000));
    const includeGeometry = !!input.includeGeometry;
    const filters = whereParts(input);
    const extra = geometryParams(input);
    const stats = { pushed: 0, requests: 0 };

    const pushResults = async (features) => {
        for (const f of features || []) {
            await Actor.pushData(mapFeature(f, includeGeometry));
            stats.pushed += 1;
        }
    };

    const queryOnce = async (where, limit, offset) => {
        const base = new URLSearchParams({
            where: where || '1=1',
            outFields: OUT_FIELDS,
            returnGeometry: includeGeometry ? 'true' : 'false',
            f: 'json',
            resultRecordCount: String(limit),
        });
        if (offset) base.set('resultOffset', String(offset));
        if (extra) for (const [k, v] of Object.entries(extra)) base.set(k, v);
        stats.requests += 1;
        return arcQuery(base.toString());
    };

    if (input.searchMode === 'catastro_numbers') {
        const nums = (input.catastroNumbers || []).map(normCatastro).map(esc).filter(Boolean);
        if (!nums.length) throw new Error('searchMode catastro_numbers requires catastroNumbers');
        const BATCH = 50;
        for (let i = 0; i < nums.length && stats.pushed < maxItems; i += BATCH) {
            const batch = nums.slice(i, i + BATCH);
            const where = `NUM_CATASTRO IN (${batch.map((n) => `'${n}'`).join(',')})`;
            const clause = filters.length ? `${where} AND ${filters.join(' AND ')}` : where;
            const body = await queryOnce(clause, Math.min(PAGE, maxItems - stats.pushed), 0);
            await pushResults(body.features);
            if (i + BATCH < nums.length) await sleep(300);
        }
    } else {
        if (input.searchMode === 'area' && !extra) {
            throw new Error('searchMode area requires a bounding box (bboxWest/South/East/North) or a center (centerLat/centerLon) with radiusKm');
        }
        const where = filters.length ? filters.join(' AND ') : '1=1';
        let offset = 0;
        while (stats.pushed < maxItems) {
            const limit = Math.min(PAGE, maxItems - stats.pushed);
            const body = await queryOnce(where, limit, offset);
            const feats = body.features || [];
            if (!feats.length) break;
            await pushResults(feats);
            if (feats.length < limit || body.exceededTransferLimit === false) break;
            offset += feats.length;
            await sleep(400);
        }
    }

    log.info(`Done: ${stats.pushed} parcels, ${stats.requests} requests`);
    await Actor.setValue('SUMMARY', { parcelsPushed: stats.pushed, requests: stats.requests });
});
