import type { Project } from './types'

export const noxhNguyenTrai: Project = {
  id:0, name:'NOXH Nguyễn Trãi', type:'NOXH', loc:'P. Sơn Qui, Đồng Tháp', prefix:'NOXH_NT',
  status:'active', statusLabel:'Đang triển khai',
  area:'1.2 ha', totalCap:'285 tỷ', totalCapNum:285, loan:'85 tỷ',
  progress:45, startDate:'15/01/2025', estEnd:'31/12/2026', lastUpdated:'10/06/2026',
  ceoKpis:{ k1:'45%', k1s:'Trễ 3 ngày so KH', k2:'0.42 tỷ', k2s:'HM 196.78 tỷ · 0%', k3:'0/1', k3s:'Hấp thụ 0%', k4:'0 tỷ', k4s:'Thực thu – 0%' },
  thuChi:{ labels:['T01','T02','T03','T04','T05'], thu:[0.75,3.35,1.20,0.90,2.28], giaiNgan:[0.20,0.55,0.70,0.55,0.47], chiTC:[0.10,0.20,0.30,0.20,0.27] },
  donut:{ labels:['Chi nhà thầu','Chi trả NCC','Chi hoạt động'], vals:[2.97,0.22,0.10], colors:['#1C3557','#D4A64A','#CBD5E1'] },
  thiCong:[ {name:'CP khác',hm:'3 HM',pct:100,cls:'fill-green'}, {name:'Tư vấn ĐTXD',hm:'4 HM · 2 trễ',pct:93,cls:'fill-navy'}, {name:'Thiết kế thi công',hm:'1 HM · 1 trễ',pct:10,cls:'fill-red'} ],
  tcAlert:'Trễ 3 ngày',
  gopVon:[ {name:'TV1 – Sơn An Hương Sơn (60%)',pct:0,camket:96.60,dago:0.42,con:96.18}, {name:'TV2 – Đô Thị Sơn An (15%)',pct:1,camket:24.15,dago:0.15,con:24.00}, {name:'TV3 – Yana Dragon Holdings (25%)',pct:20,camket:40.25,dago:7.91,con:32.34} ],
  gvAlert:'TVLD thiếu 152.52 tỷ',
  risks:[ {n:'2',t:'Trễ bàn giao – nguy cơ phạt HĐ',d:'GT-006 · NT Sao Việt · Trễ 181 ngày',tag:'Khẩn',cls:'r2',tC:'tag-urgent'}, {n:'2',t:'Thành viên liên danh thiếu vốn',d:'Sơn An Hương Sơn · Thiếu 96.18 tỷ',tag:'Khẩn',cls:'r2',tC:'tag-urgent'}, {n:'1',t:'Hồ sơ pháp lý sắp hết hạn',d:'1 hồ sơ sắp hết hạn trong 21 ngày',tag:'Theo dõi',cls:'r1',tC:'tag-watch'}, {n:'●',t:'Biến động lãi suất / tỷ giá',d:'Dư nợ 85 tỷ · Lãi ~600tr/tháng',tag:'Kiểm soát',cls:'g1',tC:'tag-ok'} ],
  riskMeta:'2 cao · 1 trung bình',
  alerts:['GT-006 trễ 181 ngày · NT Công ty Sao Việt · Tiến độ 80%','GT-003 trễ 145 ngày · NT Trung tâm quan trắc môi trường · Tiến độ 90%','Sơn An Hương Sơn chậm góp vốn · Thiếu 152.52 tỷ · Đã góp 0.42/96.60 tỷ'],
  tasks:[ {dot:'dot-amber',title:'Gia hạn / làm mới Thông Báo Khởi Công',sub:'Còn 21 ngày · Pháp chế chuẩn bị hồ sơ',date:'05/07/2026',urgent:false}, {dot:'dot-red',title:'Họp đốc thúc Sơn An Hương Sơn bổ sung vốn',sub:'CFO chủ trì · Thiếu 152.52 tỷ',date:'Khẩn',urgent:true}, {dot:'dot-amber',title:'Duyệt đề nghị thanh toán nhà thầu',sub:'Ban kế toán trình · CFO xem xét',date:'Hôm nay',urgent:false}, {dot:'dot-amber',title:'Phương án tăng tốc GT-006',sub:'NT Sao Việt · Trễ 181 ngày',date:'Hôm nay',urgent:false} ],
  legal:[ {name:'Quyết định chủ trương đầu tư',co:'Tỉnh ủy',date:'10/01/2025',state:'done'}, {name:'Giấy phép xây dựng',co:'Sở Xây dựng',date:'15/03/2025',state:'done'}, {name:'Phê duyệt thiết kế cơ sở',co:'Sở XD Hà Nội',date:'22/04/2025',state:'done'}, {name:'Hồ sơ thẩm định giá',co:'Sở Tài chính',date:'05/06/2026',state:'proc'}, {name:'Hợp đồng nhà thầu EPC',co:'Ban QLDA',date:'—',state:'proc'} ],
  phases:[ {name:'Chuẩn bị đầu tư & Pháp lý',pct:90,state:'done'}, {name:'Thiết kế & Dự toán',pct:80,state:'done'}, {name:'Đấu thầu & Thi công',pct:30,state:'active'}, {name:'Nghiệm thu & Bàn giao',pct:0,state:'pending'} ],
}
