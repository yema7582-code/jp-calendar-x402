import { ROUTES, handle } from "./worker.js";
const q=(s)=>new URLSearchParams(s);
console.log(JSON.stringify(ROUTES["/v1/business-days"].run(q("from=2026-12-25&add=5"))));
console.log(JSON.stringify(ROUTES["/v1/business-days"].run(q("from=2027-01-08&add=1"))));
console.log(JSON.stringify(ROUTES["/v1/business-days"].run(q("from=2026-11-01&to=2026-11-30"))));
console.log(JSON.stringify(ROUTES["/v1/wareki"].run(q("date=2019-05-01"))));
console.log(JSON.stringify(ROUTES["/v1/wareki"].run(q("date=1989-01-07"))));
console.log(JSON.stringify(ROUTES["/v1/holidays"].run(q("year=2026"))[1].count));
console.log((await handle(new Request("https://x.test/"))).status);
