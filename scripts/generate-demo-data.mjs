import XLSX from "xlsx";

const cities = ["北京", "上海", "广州", "深圳", "成都", "杭州"];
const genders = ["男", "女"];
const ages = ["18-24", "25-34", "35-44", "45+"];
const awareness = ["知道并使用过", "知道但没用过", "没听过"];
const channels = ["抖音", "小红书", "朋友推荐", "电商首页", "线下门店"];
const features = ["价格", "易用性", "功能完整", "响应速度", "客服"];

const rows = [];
for (let i = 1; i <= 120; i += 1) {
  const city = cities[i % cities.length];
  const gender = genders[i % 2];
  const age = ages[i % ages.length];

  const highIntent =
    (city === "深圳" || city === "上海") &&
    (age === "25-34" || age === "18-24");

  const intent = highIntent
    ? i % 10 < 7
      ? "肯定会购买"
      : "可能会购买"
    : i % 10 < 2
      ? "肯定会购买"
      : i % 10 < 6
        ? "可能会购买"
        : "暂不考虑";

  const satBase = highIntent ? 4 : 3;
  const satisfaction = Math.min(5, satBase + (i % 3 === 0 ? 1 : 0));

  const a = channels[i % channels.length];
  const b = channels[(i + 2) % channels.length];
  const channelMulti = `${a},${b}`;

  const f1 = features[i % features.length];
  const f2 = features[(i + 3) % features.length];
  const featureMulti = `${f1},${f2}`;

  const awarenessLevel =
    intent === "肯定会购买"
      ? "知道并使用过"
      : i % 4 === 0
        ? "没听过"
        : awareness[i % awareness.length];

  rows.push({
    样本ID: `U${String(i).padStart(3, "0")}`,
    城市: city,
    性别: gender,
    年龄段: age,
    品牌认知: awarenessLevel,
    购买意向: intent,
    满意度: satisfaction,
    主要触达渠道: channelMulti,
    关注功能点: featureMulti,
  });
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, ws, "survey");
XLSX.writeFile(wb, "demo-data.xlsx");

console.log("Generated demo-data.xlsx with rows:", rows.length);
