const checkInForm = document.querySelector('#checkin-form');
const learnerIdInput = document.querySelector('#learner-id');
const checkInMessage = document.querySelector('#message');
const attendanceList = document.querySelector('#attendance-list');
const reportForm = document.querySelector('#report-form');
const reportDateInput = document.querySelector('#report-date');
const reportSummary = document.querySelector('#report-summary');
const csvDownloadLink = document.querySelector('#download-csv');

function getLocalDateString() {
  const now = new Date();
  const timezoneOffset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

async function loadAttendanceReport() {
  const selectedDate = reportDateInput.value;
  const encodedDate = encodeURIComponent(selectedDate);

  csvDownloadLink.href = `/attendance/export.csv?attendance_date=${encodedDate}`;

  const response = await fetch(`/attendance?attendance_date=${encodedDate}`);
  if (!response.ok) {
    throw new Error('Could not load attendance records.');
  }

  const records = await response.json();
  reportSummary.textContent = `${records.length} check-in${records.length === 1 ? '' : 's'} for ${selectedDate}.`;
  attendanceList.replaceChildren();

  if (records.length === 0) {
    const emptyRow = document.createElement('li');
    emptyRow.textContent = 'No check-ins for this date.';
    attendanceList.append(emptyRow);
    return;
  }

  for (const record of records) {
    const row = document.createElement('li');
    const learner = document.createElement('strong');
    const checkedInTime = document.createElement('time');

    learner.textContent = record.learner_id;
    checkedInTime.dateTime = record.checked_in_at;
    checkedInTime.textContent = new Date(record.checked_in_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    row.append(learner, checkedInTime);
    attendanceList.append(row);
  }
}

async function submitCheckIn(event) {
  event.preventDefault();
  checkInMessage.className = '';
  checkInMessage.textContent = 'Saving check-in…';

  try {
    const response = await fetch('/attendance/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learner_id: learnerIdInput.value.trim() }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.detail || 'Could not save check-in.');
    }

    checkInMessage.textContent = result.status === 'checked_in'
      ? `${result.learner_id} checked in.`
      : `${result.learner_id} was already checked in today.`;
    checkInMessage.className = 'success';
    await loadAttendanceReport();
    learnerIdInput.select();
  } catch (error) {
    checkInMessage.textContent = error.message || 'Could not reach the PresenDex service.';
    checkInMessage.className = 'error';
  }
}

async function submitReportDate(event) {
  event.preventDefault();

  try {
    await loadAttendanceReport();
  } catch (error) {
    reportSummary.textContent = error.message;
  }
}

checkInForm.addEventListener('submit', submitCheckIn);
reportForm.addEventListener('submit', submitReportDate);

reportDateInput.value = getLocalDateString();
loadAttendanceReport().catch((error) => {
  checkInMessage.textContent = error.message;
  checkInMessage.className = 'error';
});
