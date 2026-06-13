/**
 * 调试高德地图 API 返回格式
 */

const apiKey = process.env.AMAP_API_KEY;
const params = new URLSearchParams({
  key: apiKey,
  keywords: '徐汇 咖啡',
  city: '上海',
  output: 'json',
  extensions: 'all',
  offset: '2',
  page: '1'
});

console.log('API Key:', apiKey?.substring(0, 10) + '...');
console.log('URL:', `https://restapi.amap.com/v3/place/text?${params.toString()}`);

fetch(`https://restapi.amap.com/v3/place/text?${params.toString()}`)
  .then(r => r.json())
  .then(data => {
    console.log('\n=== 响应数据 ===');
    console.log('Status:', data.status);
    console.log('Info:', data.info);
    console.log('Count:', data.count);
    console.log('Infocode:', data.infocode);

    if (data.pois && data.pois.length > 0) {
      console.log('\n=== 第一个 POI ===');
      console.log('ID:', data.pois[0].id);
      console.log('Name:', data.pois[0].name);
      console.log('Location:', data.pois[0].location);
      console.log('Type:', data.pois[0].type);
      console.log('Address:', data.pois[0].address);
      console.log('Area:', data.pois[0].adname);

      console.log('\n=== 完整第一个 POI ===');
      console.log(JSON.stringify(data.pois[0], null, 2));
    } else {
      console.log('\n没有 POI 数据');
    }
  })
  .catch(e => console.error('Error:', e));
