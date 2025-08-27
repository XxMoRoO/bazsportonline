// This script runs inside the users.html window

const userListContainer = document.getElementById('user-list');
const modal = document.getElementById('edit-user-modal');
const form = document.getElementById('edit-user-form');
const cancelBtn = document.getElementById('cancel-edit-btn');
const usernameDisplay = document.getElementById('username-display');
const usernameInput = document.getElementById('username-to-edit');
const adminPasswordInput = document.getElementById('admin-password-input');
const newPasswordInput = document.getElementById('new-password-input');
const errorMessage = document.getElementById('error-message');
const notificationEl = document.getElementById('notification');
const toggleAdminPasswordBtn = document.getElementById('toggle-admin-password');
const toggleNewPasswordBtn = document.getElementById('toggle-new-password');

const eyeIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
    </svg>
`;

// [--- تعديل ---] تم تحديث أيقونة العين المشطوبة لتكون أوضح
const eyeSlashIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <!-- Eye shape paths -->
      <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
      <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd" />
      <!-- Slash line path -->
      <path d="M16 4L4 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
`;

/**
 * Shows a notification message.
 * @param {string} message The message to display.
 * @param {'success'|'error'} type The type of notification.
 */
function showNotification(message, type = 'success') {
    notificationEl.textContent = message;
    // [--- تعديل ---] تم تحديث الألوان لتناسب الثيم الجديد
    notificationEl.style.backgroundColor = type === 'success' ? '#10B981' : '#EF4444';
    notificationEl.classList.remove('translate-x-[120%]');
    setTimeout(() => {
        notificationEl.classList.add('translate-x-[120%]');
    }, 3000);
}


/**
 * Fetches user data from the main process and renders it.
 */
async function renderUserList() {
    if (!userListContainer) {
        console.error('User list container not found.');
        return;
    }

    userListContainer.innerHTML = '<p class="text-gray-400">Loading users...</p>';

    try {
        const data = await window.api.getUserData();
        const allUsers = data.allUsers || [];

        if (allUsers.length > 0) {
            userListContainer.innerHTML = ''; // Clear the loading message
            allUsers.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'flex justify-between items-center p-3 bg-secondary-bg rounded-lg shadow-sm';
                userItem.innerHTML = `
                    <div>
                        <span class="font-medium">${user.username}</span>
                        <span class="text-sm text-gray-400 ml-2">${user.employeeId || ''}</span>
                    </div>
                    <button class="edit-user-btn btn btn-secondary text-sm" data-username="${user.username}">Edit</button>
                `;
                userListContainer.appendChild(userItem);
            });
        } else {
            userListContainer.innerHTML = '<p class="text-gray-400">No users found.</p>';
        }
    } catch (error) {
        console.error('Failed to load user data:', error);
        userListContainer.innerHTML = '<p class="text-red-500">Could not load user data.</p>';
    }
}

function showModal(username) {
    usernameDisplay.textContent = username;
    usernameInput.value = username;
    form.reset();
    errorMessage.classList.add('hidden');
    modal.classList.remove('hidden');
    adminPasswordInput.focus();
}

function closeModal() {
    modal.classList.add('hidden');
}

function togglePasswordVisibility(input, button) {
    if (input.type === 'password') {
        input.type = 'text';
        button.innerHTML = eyeSlashIcon;
    } else {
        input.type = 'password';
        button.innerHTML = eyeIcon;
    }
}

// --- Event Listeners ---

userListContainer.addEventListener('click', (e) => {
    const editButton = e.target.closest('.edit-user-btn');
    if (editButton) {
        const username = editButton.dataset.username;
        showModal(username);
    }
});

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const adminPassword = adminPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const username = usernameInput.value;

    if (!adminPassword || !newPassword) {
        errorMessage.textContent = 'Please fill in all fields.';
        errorMessage.classList.remove('hidden');
        return;
    }

    errorMessage.classList.add('hidden');

    const result = await window.api.changeUserPassword({
        adminPassword,
        username,
        newPassword
    });

    if (result.success) {
        showNotification('Password updated successfully!', 'success');
        closeModal();
    } else {
        errorMessage.textContent = result.message || 'An unknown error occurred.';
        errorMessage.classList.remove('hidden');
    }
});

cancelBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        closeModal();
    }
});

toggleAdminPasswordBtn.addEventListener('click', () => {
    togglePasswordVisibility(adminPasswordInput, toggleAdminPasswordBtn);
});

toggleNewPasswordBtn.addEventListener('click', () => {
    togglePasswordVisibility(newPasswordInput, toggleNewPasswordBtn);
});

document.addEventListener('DOMContentLoaded', renderUserList);
