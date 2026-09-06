// scripts/fetch-cctv.js
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.ITS_API_KEY;
if (!API_KEY) {
  console.error('ITS_API_KEY 환경변수가 없습니다. GitHub Secrets에 등록했는지 확인하세요.');
  process.exit(1);
}

const KOREA_BBOX = { minX: 124.0, maxX: 132.0, minY: 33.0, maxY: 39.0 };
const CCTV_TYPE = 4; // 실시간 스트리밍(HLS) + HTTPS

const ROAD_TYPES = [
  { type: 'ex', label: '고속도로' },
  { type: 'its', label: '국도' },
];

const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChosung(str) {
  let result = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code >= 0 && code <= 11171) result += CHO[Math.floor(code / 588)];
    else result += ch;
  }
  return result;
}

async function fetchRoadType({ type, label }) {
  const { minX, maxX, minY, maxY } = KOREA_BBOX;
  const url = `https://openapi.its.go.kr:9443/cctvInfo?apiKey=${API_KEY}&type=${type}&cctvType=${CCTV_TYPE}&minX=${minX}&maxX=${maxX}&minY=${minY}&maxY=${maxY}&getType=json`;

  console.log(`[fetch-cctv] ${label}(${type}) 호출 중...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} 호출 실패: HTTP ${res.status}`);
  const json = await res.json();
  const rawList = json?.response?.data ?? [];
  console.log(`[fetch-cctv] ${label}: ${rawList.length}건 수신`);

  return rawList.map((item, idx) => ({
    id: `${type}-${item.roadsectionid || idx}-${idx}`,
    roadType: type,
    region: label,
    pointName: item.cctvname || '',
    lat: Number(item.coordy),
    lng: Number(item.coordx),
    hlsUrl: item.cctvurl || '',
    resolution: item.cctvresolution || '',
    chosung: getChosung(item.cctvname || ''),
  }));
}

async function main() {
  const results = [];
  for (const roadType of ROAD_TYPES) {
    try {
      results.push(...(await fetchRoadType(roadType)));
    } catch (err) {
      console.error(`[fetch-cctv] ${roadType.label} 실패:`, err.message);
    }
  }

  const output = { generatedAt: new Date().toISOString(), count: results.length, items: results };
  const outDir = path.join(__dirname, '..', 'public');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'cctv-cache.json'), JSON.stringify(output));
  console.log(`[fetch-cctv] 완료: 총 ${results.length}건`);

  if (results.length === 0) {
    console.error('[fetch-cctv] 수집된 데이터가 0건입니다.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fetch-cctv] 치명적 오류:', err);
  process.exit(1);
});
