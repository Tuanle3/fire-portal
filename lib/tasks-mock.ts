export type TaskPriority = 'thấp' | 'trung' | 'cao' | 'khẩn'
export type TaskStatus   = 'chua_bat_dau' | 'dang_lam' | 'hoan_thanh' | 'tre'
export type TaskEval     = 'dat' | 'khong_dat'

export interface Task {
  id: string
  title: string
  description: string
  assignedBy: string
  assignedTo: string
  department: string
  project: string
  priority: TaskPriority
  status: TaskStatus
  progress: number     // 0–100
  deadline: string     // YYYY-MM-DD
  createdAt: string
  updatedAt: string
  notes: string
  dienBien: string
  deXuat: string
  parentId?: string    // sub-task: ID of parent task
  sharedWith?: string[] // departments that can also view this task
  evaluation?: {
    result: TaskEval
    note: string
    evaluatedAt: string
    evaluatedBy: string
  }
}

export const DEPARTMENTS = ['Ban Giám Đốc', 'Tài chính', 'Pháp lý', 'Kỹ thuật', 'Kinh doanh', 'Hành chính']
export const PROJECTS     = ['Dự án Hà Nội', 'Dự án HCM', 'Dự án Đà Nẵng', 'Nội bộ', 'Tổng thầu ABC']
export const MEMBERS      = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Cường', 'Phạm Thu Dung', 'Hoàng Văn Eo', 'Vũ Thị Phương', 'Đặng Minh Quân', 'Bùi Lan Hương']

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  thấp: 'Thấp', trung: 'Trung bình', cao: 'Cao', khẩn: 'Khẩn cấp',
}
export const STATUS_LABEL: Record<TaskStatus, string> = {
  chua_bat_dau: 'Chưa bắt đầu',
  dang_lam:     'Đang làm',
  hoan_thanh:   'Hoàn thành',
  tre:          'Trễ hạn',
}
export const EVAL_LABEL: Record<TaskEval, string> = {
  dat: 'Đạt', khong_dat: 'Không đạt',
}

export const MOCK_TASKS: Task[] = [
  {
    id: 't1',
    title: 'Lập hồ sơ pháp lý dự án Hà Nội',
    description: 'Thu thập và hoàn thiện toàn bộ hồ sơ pháp lý cho dự án khu đô thị Hà Nội',
    assignedBy: 'Nguyễn Văn An', assignedTo: 'Trần Thị Bình',
    department: 'Pháp lý', project: 'Dự án Hà Nội',
    priority: 'cao', status: 'dang_lam', progress: 60,
    deadline: '2026-07-15', createdAt: '2026-06-01', updatedAt: '2026-06-20',
    notes: 'Cần bổ sung giấy phép xây dựng',
    dienBien: 'Đã nộp hồ sơ xin cấp phép xây dựng ngày 18/6. Đang chờ phản hồi từ Sở Xây dựng.',
    deXuat: 'Đề nghị BGĐ can thiệp để đẩy nhanh quy trình phê duyệt tại Sở Xây dựng Hà Nội.',
  },
  {
    id: 't1-1', parentId: 't1',
    title: 'Thu thập chứng từ đất đai & quy hoạch',
    description: 'Thu thập giấy tờ đất đai, bản đồ quy hoạch, trích lục thửa đất',
    assignedBy: 'Trần Thị Bình', assignedTo: 'Phạm Thu Dung',
    department: 'Pháp lý', project: 'Dự án Hà Nội',
    priority: 'cao', status: 'hoan_thanh', progress: 100,
    deadline: '2026-06-25', createdAt: '2026-06-01', updatedAt: '2026-06-24',
    notes: '', dienBien: '', deXuat: '',
    evaluation: { result: 'dat', note: 'Đầy đủ, đúng yêu cầu', evaluatedAt: '2026-06-25', evaluatedBy: 'Trần Thị Bình' },
  },
  {
    id: 't1-2', parentId: 't1',
    title: 'Xin cấp giấy phép xây dựng tại Sở XD HN',
    description: 'Soạn hồ sơ và nộp đơn xin cấp giấy phép xây dựng',
    assignedBy: 'Trần Thị Bình', assignedTo: 'Trần Thị Bình',
    department: 'Pháp lý', project: 'Dự án Hà Nội',
    priority: 'cao', status: 'dang_lam', progress: 30,
    deadline: '2026-07-15', createdAt: '2026-06-18', updatedAt: '2026-06-20',
    notes: '', dienBien: 'Đã nộp hồ sơ ngày 18/6, đang chờ phản hồi.', deXuat: 'Cần BGĐ hỗ trợ liên hệ Sở.',
  },
  {
    id: 't2',
    title: 'Quyết toán quý 2/2026',
    description: 'Tổng hợp và quyết toán thu chi toàn bộ các dự án quý 2',
    assignedBy: 'Nguyễn Văn An', assignedTo: 'Lê Minh Cường',
    department: 'Tài chính', project: 'Nội bộ',
    priority: 'khẩn', status: 'dang_lam', progress: 40,
    deadline: '2026-07-05', createdAt: '2026-06-15', updatedAt: '2026-06-25',
    notes: 'Ưu tiên số 1 tháng 7',
    dienBien: 'Đã tổng hợp số liệu từ dự án HCM và Đà Nẵng. Đang chờ chứng từ từ dự án Hà Nội.',
    deXuat: 'Yêu cầu phòng Pháp lý bàn giao chứng từ thanh toán trước 28/6 để kịp tiến độ.',
  },
  {
    id: 't2-1', parentId: 't2',
    title: 'Tổng hợp số liệu dự án HCM & Đà Nẵng',
    description: 'Thu thập và đối chiếu chứng từ thu chi của 2 dự án phía Nam',
    assignedBy: 'Lê Minh Cường', assignedTo: 'Bùi Lan Hương',
    department: 'Tài chính', project: 'Nội bộ',
    priority: 'khẩn', status: 'hoan_thanh', progress: 100,
    deadline: '2026-06-28', createdAt: '2026-06-15', updatedAt: '2026-06-27',
    notes: '', dienBien: '', deXuat: '',
    evaluation: { result: 'dat', note: 'Hoàn thành sớm 1 ngày', evaluatedAt: '2026-06-27', evaluatedBy: 'Lê Minh Cường' },
  },
  {
    id: 't2-2', parentId: 't2',
    title: 'Tổng hợp số liệu dự án Hà Nội',
    description: 'Thu thập chứng từ từ phòng Pháp lý và đối chiếu số liệu HN',
    assignedBy: 'Lê Minh Cường', assignedTo: 'Lê Minh Cường',
    department: 'Tài chính', project: 'Nội bộ',
    priority: 'khẩn', status: 'dang_lam', progress: 20,
    deadline: '2026-07-03', createdAt: '2026-06-15', updatedAt: '2026-06-26',
    notes: '', dienBien: 'Đang chờ phòng Pháp lý bàn giao chứng từ.', deXuat: 'Yêu cầu bàn giao trước 28/6.',
  },
  {
    id: 't3',
    title: 'Đàm phán hợp đồng tổng thầu ABC',
    description: 'Thương thảo các điều khoản hợp đồng với nhà tổng thầu ABC cho gói thầu xây dựng',
    assignedBy: 'Nguyễn Văn An', assignedTo: 'Phạm Thu Dung',
    department: 'Kinh doanh', project: 'Tổng thầu ABC',
    priority: 'cao', status: 'tre', progress: 25,
    deadline: '2026-06-20', createdAt: '2026-05-20', updatedAt: '2026-06-22',
    notes: 'Đã trễ 7 ngày so với kế hoạch',
    dienBien: 'Phiên đàm phán lần 2 ngày 21/6 không đạt kết quả do hai bên chưa thống nhất điều khoản bảo hành.',
    deXuat: 'Đề nghị mời luật sư tư vấn tham gia phiên đàm phán tiếp theo. Cần có quyết định từ BGĐ về giới hạn nhượng bộ.',
  },
  {
    id: 't4',
    title: 'Khảo sát địa hình dự án Đà Nẵng',
    description: 'Thực hiện khảo sát địa hình, địa chất khu vực dự án tại Đà Nẵng',
    assignedBy: 'Hoàng Văn Eo', assignedTo: 'Vũ Thị Phương',
    department: 'Kỹ thuật', project: 'Dự án Đà Nẵng',
    priority: 'trung', status: 'hoan_thanh', progress: 100,
    deadline: '2026-06-25', createdAt: '2026-06-01', updatedAt: '2026-06-24',
    notes: 'Đã nộp báo cáo khảo sát',
    dienBien: '', deXuat: '',
    evaluation: { result: 'dat', note: 'Hoàn thành đúng tiến độ, báo cáo chất lượng tốt', evaluatedAt: '2026-06-24', evaluatedBy: 'Hoàng Văn Eo' },
  },
  {
    id: 't5',
    title: 'Chuẩn bị tài liệu tender dự án HCM',
    description: 'Soạn thảo hồ sơ mời thầu cho gói thầu xây dựng tại TP.HCM',
    assignedBy: 'Nguyễn Văn An', assignedTo: 'Đặng Minh Quân',
    department: 'Kinh doanh', project: 'Dự án HCM',
    priority: 'cao', status: 'dang_lam', progress: 55,
    deadline: '2026-07-20', createdAt: '2026-06-10', updatedAt: '2026-06-26',
    notes: '',
    dienBien: 'Đã hoàn thành phần mô tả kỹ thuật. Đang soạn thảo các điều kiện hợp đồng và tiêu chí đánh giá.',
    deXuat: 'Cần phòng Kỹ thuật xác nhận thông số kỹ thuật tối thiểu trước 30/6 để hoàn thiện hồ sơ.',
  },
  {
    id: 't6',
    title: 'Kiểm tra hệ thống PCCC tòa nhà A',
    description: 'Kiểm tra định kỳ hệ thống phòng cháy chữa cháy tòa nhà A dự án HCM',
    assignedBy: 'Hoàng Văn Eo', assignedTo: 'Vũ Thị Phương',
    department: 'Kỹ thuật', project: 'Dự án HCM',
    priority: 'trung', status: 'chua_bat_dau', progress: 0,
    deadline: '2026-07-30', createdAt: '2026-06-20', updatedAt: '2026-06-20',
    notes: 'Lên lịch với đơn vị kiểm định',
    dienBien: '',
    deXuat: 'Cần hành chính đặt lịch với đơn vị kiểm định PCCC TP.HCM. Thời gian phù hợp: tuần 2 tháng 7.',
  },
  {
    id: 't7',
    title: 'Nộp thuế VAT tháng 6',
    description: 'Kê khai và nộp thuế GTGT tháng 6 cho các pháp nhân công ty',
    assignedBy: 'Nguyễn Văn An', assignedTo: 'Bùi Lan Hương',
    department: 'Tài chính', project: 'Nội bộ',
    priority: 'khẩn', status: 'tre', progress: 70,
    deadline: '2026-06-20', createdAt: '2026-06-05', updatedAt: '2026-06-26',
    notes: 'Đang chờ bổ sung chứng từ từ dự án HN',
    dienBien: 'Đã kê khai xong cho 2 pháp nhân. Còn 1 pháp nhân dự án HN chưa có đủ chứng từ đầu vào.',
    deXuat: 'Đề nghị phòng Pháp lý bàn giao ngay chứng từ hóa đơn GTGT tháng 6 để hoàn tất kê khai tránh phạt chậm nộp.',
  },
  {
    id: 't8',
    title: 'Rà soát hợp đồng lao động nhân sự mới',
    description: 'Kiểm tra và chuẩn hóa hợp đồng lao động cho 5 nhân sự mới gia nhập tháng 6',
    assignedBy: 'Trần Thị Bình', assignedTo: 'Bùi Lan Hương',
    department: 'Hành chính', project: 'Nội bộ',
    priority: 'trung', status: 'hoan_thanh', progress: 100,
    deadline: '2026-06-30', createdAt: '2026-06-12', updatedAt: '2026-06-27',
    notes: '', dienBien: '', deXuat: '',
    evaluation: { result: 'dat', note: 'Đúng quy trình, đầy đủ hồ sơ 5 nhân sự', evaluatedAt: '2026-06-27', evaluatedBy: 'Trần Thị Bình' },
  },
  {
    id: 't9',
    title: 'Lập bản vẽ thiết kế hạ tầng kỹ thuật HN',
    description: 'Thiết kế hệ thống hạ tầng kỹ thuật (điện, nước, thoát nước) khu đô thị Hà Nội',
    assignedBy: 'Hoàng Văn Eo', assignedTo: 'Đặng Minh Quân',
    department: 'Kỹ thuật', project: 'Dự án Hà Nội',
    priority: 'cao', status: 'dang_lam', progress: 35,
    deadline: '2026-08-01', createdAt: '2026-06-15', updatedAt: '2026-06-26',
    notes: 'Phối hợp với đơn vị tư vấn thiết kế',
    dienBien: 'Hoàn thành bản vẽ hệ thống điện. Đang thiết kế hệ thống cấp thoát nước, dự kiến xong 10/7.',
    deXuat: 'Cần đơn vị tư vấn cung cấp số liệu nhu cầu dùng nước theo quy hoạch để hoàn thiện thiết kế.',
  },
  {
    id: 't9-1', parentId: 't9',
    title: 'Thiết kế hệ thống điện trung & hạ thế',
    description: 'Bản vẽ thi công hệ thống điện toàn khu',
    assignedBy: 'Đặng Minh Quân', assignedTo: 'Đặng Minh Quân',
    department: 'Kỹ thuật', project: 'Dự án Hà Nội',
    priority: 'cao', status: 'hoan_thanh', progress: 100,
    deadline: '2026-07-05', createdAt: '2026-06-15', updatedAt: '2026-06-26',
    notes: '', dienBien: '', deXuat: '',
    evaluation: { result: 'dat', note: 'Bản vẽ đúng tiêu chuẩn', evaluatedAt: '2026-06-26', evaluatedBy: 'Đặng Minh Quân' },
  },
  {
    id: 't9-2', parentId: 't9',
    title: 'Thiết kế hệ thống cấp & thoát nước',
    description: 'Bản vẽ thi công hệ thống cấp thoát nước toàn khu',
    assignedBy: 'Đặng Minh Quân', assignedTo: 'Vũ Thị Phương',
    department: 'Kỹ thuật', project: 'Dự án Hà Nội',
    priority: 'cao', status: 'dang_lam', progress: 20,
    deadline: '2026-08-01', createdAt: '2026-06-20', updatedAt: '2026-06-26',
    notes: '', dienBien: 'Đang chờ số liệu nhu cầu từ đơn vị tư vấn.', deXuat: 'Cần đơn vị tư vấn cung cấp trước 5/7.',
  },
  {
    id: 't10',
    title: 'Báo cáo tiến độ tháng 6 cho cổ đông',
    description: 'Chuẩn bị báo cáo tiến độ tổng thể các dự án trình bày trong cuộc họp cổ đông',
    assignedBy: 'Nguyễn Văn An', assignedTo: 'Trần Thị Bình',
    department: 'Ban Giám Đốc', project: 'Nội bộ',
    priority: 'cao', status: 'dang_lam', progress: 80,
    deadline: '2026-06-30', createdAt: '2026-06-20', updatedAt: '2026-06-27',
    notes: '',
    dienBien: 'Đã tổng hợp số liệu từ tất cả phòng ban. Đang hoàn thiện slide trình bày và phần phân tích rủi ro.',
    deXuat: '',
  },
  {
    id: 't11',
    title: 'Đăng ký giấy phép môi trường dự án ĐN',
    description: 'Chuẩn bị và nộp hồ sơ xin cấp giấy phép môi trường cho dự án Đà Nẵng',
    assignedBy: 'Trần Thị Bình', assignedTo: 'Phạm Thu Dung',
    department: 'Pháp lý', project: 'Dự án Đà Nẵng',
    priority: 'cao', status: 'chua_bat_dau', progress: 0,
    deadline: '2026-07-10', createdAt: '2026-06-25', updatedAt: '2026-06-25',
    notes: 'Liên hệ Sở TN&MT Đà Nẵng',
    dienBien: '',
    deXuat: 'Cần phòng Kỹ thuật cung cấp báo cáo đánh giá tác động môi trường (ĐTM) làm cơ sở lập hồ sơ.',
  },
  {
    id: 't12',
    title: 'Nghiệm thu gói thầu số 3 dự án HCM',
    description: 'Tổ chức nghiệm thu và ký biên bản hoàn thành gói thầu số 3',
    assignedBy: 'Hoàng Văn Eo', assignedTo: 'Lê Minh Cường',
    department: 'Kỹ thuật', project: 'Dự án HCM',
    priority: 'trung', status: 'chua_bat_dau', progress: 0,
    deadline: '2026-07-25', createdAt: '2026-06-22', updatedAt: '2026-06-22',
    notes: '', dienBien: '', deXuat: '',
  },
]
