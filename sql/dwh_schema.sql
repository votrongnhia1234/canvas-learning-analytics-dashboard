-- Bảng lưu thông tin học viên
CREATE TABLE IF NOT EXISTS dim_students (
    student_id BIGINT PRIMARY KEY,
    student_name VARCHAR(255),
    student_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu thông tin khóa học
CREATE TABLE IF NOT EXISTS dim_courses (
    course_id BIGINT PRIMARY KEY,
    course_name VARCHAR(255),
    course_code VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu thông tin bài tập
CREATE TABLE IF NOT EXISTS dim_assignments (
    assignment_id BIGINT PRIMARY KEY,
    course_id BIGINT REFERENCES dim_courses(course_id),
    assignment_name VARCHAR(255),
    due_at TIMESTAMP WITH TIME ZONE,
    points_possible NUMERIC(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bảng sự kiện chính: mỗi lần nộp bài là 1 dòng
CREATE TABLE IF NOT EXISTS fact_submissions (
    submission_id BIGINT PRIMARY KEY,
    student_id BIGINT REFERENCES dim_students(student_id),
    course_id BIGINT REFERENCES dim_courses(course_id),
    assignment_id BIGINT REFERENCES dim_assignments(assignment_id),
    submitted_at TIMESTAMP WITH TIME ZONE,
    grade NUMERIC(5, 2),
    late BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
