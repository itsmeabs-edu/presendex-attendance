const dashboardMessage = document.querySelector('#dashboard-message');
const workspace = document.querySelector('#workspace');
const classSelect = document.querySelector('#workspace-class');
const attendanceDateInput = document.querySelector('#attendance-date');
const classTools = document.querySelector('#class-tools');
const classEmpty = document.querySelector('#class-empty');
const csvDownload = document.querySelector('#csv-download');
const markedDaysSelect = document.querySelector('#marked-days');
const scheduleForm = document.querySelector('#schedule-form');

let currentAccount = null;
let availableClasses = [];
let availableTeachers = [];

function localDateString() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function showMessage(message, kind = '') {
  dashboardMessage.textContent = message;
  dashboardMessage.className = `form-message ${kind}`.trim();
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 204) return null;

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) window.location.assign('/login');
    throw new Error(result.detail || 'The request could not be completed.');
  }
  return result;
}

function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function fillTeacherOptions(select, selectedTeacherId = '') {
  select.replaceChildren();
  addOption(select, '', 'Unassigned');
  for (const teacher of availableTeachers) {
    addOption(select, String(teacher.id), `${teacher.full_name} · ${teacher.username}`);
  }
  select.value = selectedTeacherId ? String(selectedTeacherId) : '';
}

function renderClassAssignments() {
  const classList = document.querySelector('#class-list');
  classList.replaceChildren();
  if (availableClasses.length === 0) {
    classList.textContent = 'No classes yet. Create the first class above.';
    return;
  }

  for (const schoolClass of availableClasses) {
    const row = document.createElement('form');
    row.className = 'class-assignment';
    row.dataset.classId = schoolClass.id;

    const name = document.createElement('strong');
    name.textContent = schoolClass.name;

    const teacherSelect = document.createElement('select');
    teacherSelect.setAttribute('aria-label', `Class teacher for ${schoolClass.name}`);
    fillTeacherOptions(teacherSelect, schoolClass.class_teacher_id);

    const save = document.createElement('button');
    save.className = 'button button-light button-small';
    save.type = 'submit';
    save.textContent = 'Save';

    row.append(name, teacherSelect, save);
    row.addEventListener('submit', async (event) => {
      event.preventDefault();
      const teacherId = teacherSelect.value ? Number(teacherSelect.value) : null;
      try {
        await api(`/api/classes/${schoolClass.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ class_teacher_id: teacherId }),
        });
        showMessage(`Class teacher updated for ${schoolClass.name}.`, 'success');
        await loadClasses(schoolClass.id);
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
    classList.append(row);
  }
}

async function loadClasses(preferredClassId = null) {
  availableClasses = await api('/api/classes');
  const previousId = (preferredClassId ?? Number(classSelect.value)) || null;

  classSelect.replaceChildren();
  addOption(classSelect, '', availableClasses.length ? 'Choose a class' : 'No assigned classes yet');
  for (const schoolClass of availableClasses) {
    addOption(classSelect, String(schoolClass.id), schoolClass.name);
  }

  if (currentAccount.role === 'admin') renderClassAssignments();
  const selected = availableClasses.find((schoolClass) => schoolClass.id === previousId);
  classSelect.value = selected ? String(selected.id) : '';
  if (!selected && availableClasses.length === 1) classSelect.value = String(availableClasses[0].id);
  await loadSelectedClass();
}

async function loadTeachers() {
  availableTeachers = await api('/api/teachers');
  fillTeacherOptions(document.querySelector('#class-teacher'));
  renderClassAssignments();
}

function currentClassId() {
  return Number(classSelect.value) || null;
}

function updateReportLink() {
  const classId = currentClassId();
  const selectedDate = attendanceDateInput.value;
  if (!classId || !selectedDate) {
    csvDownload.href = '#';
    csvDownload.setAttribute('aria-disabled', 'true');
    return;
  }
  csvDownload.href = `/api/classes/${classId}/attendance.csv?attendance_date=${encodeURIComponent(selectedDate)}`;
  csvDownload.removeAttribute('aria-disabled');
}

function renderStudentList(students) {
  const studentList = document.querySelector('#student-list');
  studentList.replaceChildren();
  if (students.length === 0) {
    studentList.textContent = 'No students in this class yet.';
    return;
  }

  for (const student of students) {
    const row = document.createElement('form');
    row.className = 'student-row';

    const name = document.createElement('input');
    name.value = student.full_name;
    name.maxLength = 120;
    name.setAttribute('aria-label', `Student name, code ${student.student_code}`);
    name.required = true;

    const code = document.createElement('span');
    code.className = 'student-code';
    code.textContent = student.student_code;

    const qrDownload = document.createElement('a');
    qrDownload.className = 'button button-light button-small qr-download';
    qrDownload.href = `/api/students/${student.id}/qr.png`;
    qrDownload.download = `presendex-${student.student_code}.png`;
    qrDownload.textContent = 'Download QR';
    qrDownload.setAttribute('aria-label', `Download QR code for ${student.full_name}`);

    const controls = document.createElement('span');
    controls.className = 'active-toggle';
    const active = document.createElement('input');
    active.type = 'checkbox';
    active.checked = student.is_active;
    active.setAttribute('aria-label', `Active student ${student.full_name}`);
    const activeText = document.createElement('span');
    activeText.textContent = 'Active';
    controls.append(active, activeText);

    const save = document.createElement('button');
    save.className = 'button button-light button-small';
    save.type = 'submit';
    save.textContent = 'Save';

    row.append(name, code);
    if (student.is_active) row.append(qrDownload);
    row.append(controls, save);
    row.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await api(`/api/students/${student.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ full_name: name.value.trim(), is_active: active.checked }),
        });
        showMessage(`Saved changes for ${name.value.trim()}.`, 'success');
        await loadAttendance();
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
    studentList.append(row);
  }
}


function renderAttendanceSummary(summaries) {
  const body = document.querySelector('#attendance-summary');
  body.replaceChildren();
  if (summaries.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.textContent = 'No active students in this class.';
    row.append(cell);
    body.append(row);
    return;
  }
  for (const summary of summaries) {
    const row = document.createElement('tr');
    const values = [summary.full_name, summary.attendance_rate === null ? 'No records' : `${summary.attendance_rate}%`, summary.present, summary.late, summary.absent, summary.excused, summary.days_recorded];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    body.append(row);
  }
}

async function loadAttendanceSummary() {
  const classId = currentClassId();
  if (!classId) return;
  renderAttendanceSummary(await api(`/api/classes/${classId}/attendance/summary`));
}

function renderMarkedDays(dates) {
  markedDaysSelect.replaceChildren();
  addOption(markedDaysSelect, '', dates.length ? 'Choose a marked day' : 'No marked days yet');
  for (const markedDate of dates) {
    const label = new Date(`${markedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    addOption(markedDaysSelect, markedDate, label);
  }
  markedDaysSelect.value = dates.includes(attendanceDateInput.value) ? attendanceDateInput.value : '';
}

async function loadMarkedDays() {
  const classId = currentClassId();
  if (!classId) return;
  renderMarkedDays(await api(`/api/classes/${classId}/attendance/dates`));
}

function syncScheduleScopeFields() {
  const scope = document.querySelector('#schedule-scope').value;
  document.querySelector('#schedule-weekday-group').hidden = scope !== 'weekday';
  document.querySelector('#schedule-date-group').hidden = scope !== 'date';
}

function scheduleRuleLabel(rule) {
  const target = rule.class_id === null ? 'Whole school' : 'This class';
  let scope = 'General default';
  if (rule.specific_date) scope = new Date(`${rule.specific_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  else if (rule.weekday !== null) scope = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][rule.weekday];
  return { target, scope };
}

function renderScheduleRules(rules) {
  const list = document.querySelector('#schedule-list');
  list.replaceChildren();
  if (rules.length === 0) {
    list.textContent = 'No start-time rules yet.';
    return;
  }
  for (const rule of rules) {
    const row = document.createElement('div');
    row.className = 'schedule-rule';
    const description = document.createElement('span');
    const label = scheduleRuleLabel(rule);
    description.textContent = `${label.target} · ${label.scope} · ${rule.start_time}`;
    row.append(description);
    if (currentAccount.role === 'admin' || rule.class_id === currentClassId()) {
      const remove = document.createElement('button');
      remove.className = 'button button-light button-small';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${label.target.toLowerCase()} ${label.scope.toLowerCase()} start time`);
      remove.addEventListener('click', async () => {
        try {
          await api(`/api/schedules/${rule.id}`, { method: 'DELETE' });
          await loadSchedules();
          showMessage('Start-time rule removed.', 'success');
        } catch (error) { showMessage(error.message, 'error'); }
      });
      row.append(remove);
    }
    list.append(row);
  }
}

async function loadSchedules() {
  const classId = currentClassId();
  if (!classId) return;
  const query = new URLSearchParams({ for_date: attendanceDateInput.value });
  const data = await api(`/api/classes/${classId}/schedules?${query}`);
  renderScheduleRules(data.rules);
  const effective = document.querySelector('#schedule-effective');
  effective.textContent = data.effective
    ? `Effective start time for ${attendanceDateInput.value}: ${data.effective.start_time} (computer's local time).`
    : 'No start time is set; QR check-ins will be marked present.';
}

async function saveSchedule(event) {
  event.preventDefault();
  const classId = currentClassId();
  if (!classId) return;
  const scope = document.querySelector('#schedule-scope').value;
  const targetClass = currentAccount.role === 'admin' && document.querySelector('#schedule-target').value === 'school' ? null : classId;
  const payload = {
    class_id: targetClass,
    weekday: scope === 'weekday' ? Number(document.querySelector('#schedule-weekday').value) : null,
    specific_date: scope === 'date' ? document.querySelector('#schedule-date').value : null,
    start_time: document.querySelector('#schedule-start-time').value,
  };
  if (!payload.start_time || (scope === 'date' && !payload.specific_date)) {
    showMessage('Choose a start time and complete the selected schedule details.', 'error');
    return;
  }
  try {
    await api('/api/schedules', { method: 'PUT', body: JSON.stringify(payload) });
    document.querySelector('#schedule-start-time').value = '';
    await loadSchedules();
    showMessage('School start time saved.', 'success');
  } catch (error) { showMessage(error.message, 'error'); }
}

function renderAttendance(records) {
  const attendanceList = document.querySelector('#attendance-list');
  attendanceList.replaceChildren();
  if (records.length === 0) {
    attendanceList.textContent = 'Add students to this class to start taking attendance.';
    return;
  }

  const statuses = [
    ['present', 'Present'],
    ['late', 'Late'],
    ['absent', 'Absent'],
    ['excused', 'Excused'],
  ];

  for (const record of records) {
    const row = document.createElement('form');
    row.className = 'attendance-row';
    const name = document.createElement('span');
    name.textContent = `${record.full_name} · ${record.student_code}`;

    const select = document.createElement('select');
    select.setAttribute('aria-label', `Attendance status for ${record.full_name}`);
    addOption(select, '', record.status === 'unmarked' ? 'Choose status' : 'Change status');
    for (const [value, label] of statuses) addOption(select, value, label);
    select.value = record.status === 'unmarked' ? '' : record.status;

    const save = document.createElement('button');
    save.className = 'button button-primary button-small';
    save.type = 'submit';
    save.textContent = 'Save';

    row.append(name, select, save);
    row.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!select.value) {
        showMessage('Choose an attendance status first.', 'error');
        return;
      }
      try {
        await api(`/api/classes/${currentClassId()}/attendance/${record.student_id}`, {
          method: 'PUT',
          body: JSON.stringify({ attendance_date: attendanceDateInput.value, status: select.value }),
        });
        showMessage(`Attendance saved for ${record.full_name}.`, 'success');
        await Promise.all([loadAttendanceSummary(), loadMarkedDays()]);
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
    attendanceList.append(row);
  }
}

async function loadStudents() {
  const classId = currentClassId();
  if (!classId) return;
  const students = await api(`/api/classes/${classId}/students`);
  renderStudentList(students);
}

async function loadAttendance() {
  const classId = currentClassId();
  if (!classId) return;
  updateReportLink();
  const query = new URLSearchParams({ attendance_date: attendanceDateInput.value });
  renderAttendance(await api(`/api/classes/${classId}/attendance?${query}`));
}

async function loadSelectedClass() {
  const classId = currentClassId();
  const hasClass = classId !== null;
  classEmpty.hidden = hasClass;
  classTools.hidden = !hasClass;
  updateReportLink();
  if (!hasClass) return;

  try {
    await Promise.all([loadStudents(), loadAttendance(), loadMarkedDays(), loadAttendanceSummary(), loadSchedules()]);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function createClass(event) {
  event.preventDefault();
  const teacherValue = document.querySelector('#class-teacher').value;
  try {
    const schoolClass = await api('/api/classes', {
      method: 'POST',
      body: JSON.stringify({
        name: document.querySelector('#class-name').value.trim(),
        class_teacher_id: teacherValue ? Number(teacherValue) : null,
      }),
    });
    event.currentTarget.reset();
    showMessage(`${schoolClass.name} was created.`, 'success');
    await loadClasses(schoolClass.id);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function createTeacher(event) {
  event.preventDefault();
  try {
    const teacher = await api('/api/teachers', {
      method: 'POST',
      body: JSON.stringify({
        full_name: document.querySelector('#teacher-name').value.trim(),
        username: document.querySelector('#teacher-username').value.trim(),
        temporary_password: document.querySelector('#teacher-password').value,
      }),
    });
    event.currentTarget.reset();
    showMessage(`Teacher account for ${teacher.full_name} created. Assign a class and share the sign-in details privately.`, 'success');
    await loadTeachers();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function createStudent(event) {
  event.preventDefault();
  const classId = currentClassId();
  if (!classId) return;
  const nameInput = document.querySelector('#student-name');
  try {
    const student = await api(`/api/classes/${classId}/students`, {
      method: 'POST',
      body: JSON.stringify({ full_name: nameInput.value.trim() }),
    });
    nameInput.value = '';
    showMessage(`${student.full_name} was added. Student code: ${student.student_code}.`, 'success');
    await Promise.all([loadStudents(), loadAttendance(), loadAttendanceSummary(), loadMarkedDays()]);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function changePassword(event) {
  event.preventDefault();
  const currentPassword = document.querySelector('#current-password').value;
  const newPassword = document.querySelector('#new-password').value;
  const confirmPassword = document.querySelector('#confirm-new-password').value;
  if (newPassword !== confirmPassword) {
    showMessage('The new passwords do not match.', 'error');
    return;
  }

  try {
    await api('/api/me/password', {
      method: 'PUT',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    showMessage('Password updated. Your class workspace is ready.', 'success');
    await loadDashboard();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function signOut() {
  try {
    await api('/api/logout', { method: 'POST' });
  } finally {
    window.location.assign('/');
  }
}

async function loadDashboard() {
  try {
    currentAccount = await api('/api/me');
  } catch {
    window.location.assign('/login');
    return;
  }

  document.querySelector('#account-label').textContent = currentAccount.full_name;
  document.querySelector('#role-label').textContent = currentAccount.role === 'admin' ? 'School admin' : 'Teacher workspace';
  document.querySelector('#welcome-title').textContent = `Welcome, ${currentAccount.full_name.split(' ')[0]}`;
  document.querySelector('#welcome-copy').textContent = currentAccount.role === 'admin'
    ? 'Set up your school and keep every class organized.'
    : 'Manage your assigned class and its attendance.';
  document.querySelector('#today-label').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  if (currentAccount.must_change_password) {
    document.querySelector('#password-panel').hidden = false;
    workspace.hidden = true;
    return;
  }

  document.querySelector('#password-panel').hidden = true;
  workspace.hidden = false;
  const isAdmin = currentAccount.role === 'admin';
  document.querySelector('#admin-tools').hidden = !isAdmin;

  try {
    if (isAdmin) await loadTeachers();
    await loadClasses();
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.querySelector('#logout-button').addEventListener('click', signOut);
document.querySelector('#class-form').addEventListener('submit', createClass);
document.querySelector('#teacher-form').addEventListener('submit', createTeacher);
document.querySelector('#student-form').addEventListener('submit', createStudent);
document.querySelector('#password-form').addEventListener('submit', changePassword);
document.querySelector('#load-attendance').addEventListener('click', () => loadAttendance().catch((error) => showMessage(error.message, 'error')));
scheduleForm.addEventListener('submit', saveSchedule);
document.querySelector('#schedule-scope').addEventListener('change', syncScheduleScopeFields);
markedDaysSelect.addEventListener('change', () => {
  if (!markedDaysSelect.value) return;
  attendanceDateInput.value = markedDaysSelect.value;
  loadAttendance().catch((error) => showMessage(error.message, 'error'));
  loadSchedules().catch((error) => showMessage(error.message, 'error'));
});
classSelect.addEventListener('change', loadSelectedClass);
attendanceDateInput.addEventListener('change', () => {
  markedDaysSelect.value = [...markedDaysSelect.options].some((option) => option.value === attendanceDateInput.value) ? attendanceDateInput.value : '';
  loadAttendance().catch((error) => showMessage(error.message, 'error'));
  loadSchedules().catch((error) => showMessage(error.message, 'error'));
});
syncScheduleScopeFields();
attendanceDateInput.value = localDateString();

loadDashboard();
