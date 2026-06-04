/* ══════════════════════════════════════════════
   PULSE CHAT — chat.js
   WebSocket · STOMP · UI logic
══════════════════════════════════════════════ */

'use strict';

/* ════════════════════════════════════════════
   MOBILE VIEWPORT FIX
════════════════════════════════════════════ */
function fixViewportHeight() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const cs = document.getElementById('chatScreen');
    if (cs && cs.style.display !== 'none') {
        cs.style.height = vh + 'px';
    }
}

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fixViewportHeight);
    window.visualViewport.addEventListener('scroll', fixViewportHeight);
} else {
    window.addEventListener('resize', fixViewportHeight);
}


/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
var stompClient      = null;
var currentRoom      = null;
var currentUser      = null;
var currentHostToken = null;
var typingTimer      = null;
var amTyping         = false;
var typingUsers      = new Set();

/* Reply state */
var replyingTo = null; // { id, sender, message, messageType }


/* ════════════════════════════════════════════
   SOUNDS
════════════════════════════════════════════ */
let _audioCtx;

function getAudioCtx() {
    if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _audioCtx;
}

function playTone(freq, type, duration, volume, delay) {
    delay = delay || 0;
    try {
        const ctx  = getAudioCtx();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type            = type;
        osc.frequency.value = freq;
        const t = ctx.currentTime + delay;
        gain.gain.setValueAtTime(volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
        osc.start(t);
        osc.stop(t + duration);
    } catch (e) { /* silently ignore */ }
}

function soundJoin()    { playTone(880,  'sine', 0.25, 0.18); playTone(1100, 'sine', 0.20, 0.12, 0.12); }
function soundLeave()   { playTone(660,  'sine', 0.25, 0.14); playTone(440,  'sine', 0.25, 0.09, 0.12); }
function soundMessage() { playTone(1200, 'sine', 0.12, 0.09); }

document.addEventListener('click', function () {
    try { getAudioCtx().resume(); } catch (e) { }
}, { once: true });


/* ════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════ */
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return 'hsl(' + (Math.abs(hash) % 360) + ', 62%, 56%)';
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shakeInput(id) {
    const el = document.getElementById(id);
    el.classList.add('error');
    setTimeout(() => el.classList.remove('error'), 800);
}


/* ════════════════════════════════════════════
   JOIN SCREEN
════════════════════════════════════════════ */
document.getElementById('createRoomBtn').onclick = function () {
    const code = generateRoomCode();
    document.getElementById('generatedCode').textContent = code;
    document.getElementById('createdRoomBox').style.display = 'block';
    document.getElementById('roomInput').value = code;

    fetch('/createRoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: code })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            localStorage.setItem('hostToken_' + code, data.hostToken);
        });

    document.getElementById('codeBox').onclick = function () {
        navigator.clipboard.writeText(code).catch(function () { });
        const val  = document.getElementById('generatedCode');
        const hint = document.querySelector('.code-hint');
        val.textContent  = 'COPIED!';
        hint.textContent = '✓ Copied to clipboard';
        setTimeout(function () {
            val.textContent  = code;
            hint.textContent = 'Tap to copy · Share with friends';
        }, 1800);
    };
};

document.getElementById('enterCreatedBtn').onclick = enterChat;
document.getElementById('joinRoomBtn').onclick     = enterChat;

function enterChat() {
    var name = document.getElementById('nameInput').value.trim();
    var room = document.getElementById('roomInput').value.trim().toUpperCase();

    if (!name) { shakeInput('nameInput'); return; }
    if (!room) { shakeInput('roomInput'); return; }

    fetch('/canJoin/' + room)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.allowed) {
                var storedToken = localStorage.getItem('hostToken_' + room);
                if (!storedToken) {
                    alert('This room is locked by the host 🔒');
                    return;
                }
            }

            fetch('/requestJoin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomCode: room, username: name })
            })
                .then(function (r) { return r.json(); })
                .then(function (result) {
                    if (result.status === 'pending') {
                        showWaitingScreen(name, room);
                    } else {
                        proceedToRoom(name, room);
                    }
                });
        });
}

function proceedToRoom(name, room) {
    currentUser      = name;
    currentRoom      = room;
    currentHostToken = null;

    sessionStorage.setItem('currentUser', name);
    sessionStorage.setItem('currentRoom', room);

    document.getElementById('joinScreen').style.display  = 'none';
    document.getElementById('chatScreen').style.display  = 'flex';
    fixViewportHeight();

    document.getElementById('roomPill').textContent        = room;
    document.getElementById('headerRoomTitle').textContent = 'Room ' + room;
    document.getElementById('headerMeta').textContent      = 'You: ' + name;
    document.getElementById('sidebarRoomCode').textContent = room;

    document.getElementById('roomPill').onclick = function () {
        navigator.clipboard.writeText(room).catch(function () { });
        var pill = document.getElementById('roomPill');
        pill.textContent = 'COPIED!';
        setTimeout(function () { pill.textContent = room; }, 1500);
    };

    connectToRoom(room, name);

    var storedToken = localStorage.getItem('hostToken_' + room);
    if (storedToken) {
        fetch('/verifyHost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode: room, hostToken: storedToken })
        })
            .then(function (r) { return r.json(); })
            .then(function (result) {
                if (result.valid) {
                    currentHostToken = storedToken;
                    showHostControls();
                } else {
                    localStorage.removeItem('hostToken_' + room);
                    currentHostToken = null;
                }
            });
    }
}

function showJoinRequestNotification(username) {
    var notif = document.createElement('div');
    notif.id = 'joinReq_' + username;
    notif.style.cssText = [
        'position:fixed',
        'bottom:80px',
        'right:16px',
        'background:rgba(18,18,28,0.98)',
        'border:1px solid rgba(124,106,255,0.4)',
        'border-radius:14px',
        'padding:14px',
        'z-index:9999',
        'display:flex',
        'flex-direction:column',
        'gap:10px',
        'min-width:220px',
        'box-shadow:0 10px 40px rgba(0,0,0,0.6)'
    ].join(';');

    notif.innerHTML =
        '<div style="font-size:13px;color:#fff;font-weight:600">🔔 Join Request</div>' +
        '<div style="font-size:12px;color:#a78bfa"><b>' + username + '</b> wants to rejoin</div>' +
        '<div style="display:flex;gap:8px;">' +
        '<button id="approveBtn_' + username + '" style="flex:1;padding:6px;background:rgba(74,222,128,0.15);border:1px solid rgba(74,222,128,0.3);color:#4ade80;border-radius:8px;cursor:pointer;font-size:12px;">✓ Approve</button>' +
        '<button id="denyBtn_' + username + '" style="flex:1;padding:6px;background:rgba(255,107,107,0.15);border:1px solid rgba(255,107,107,0.3);color:#ff6b6b;border-radius:8px;cursor:pointer;font-size:12px;">✗ Deny</button>' +
        '</div>';

    document.getElementById('chatScreen').appendChild(notif);

    document.getElementById('approveBtn_' + username).onclick = function () {
        handleJoinRequest(username, 'approve');
        notif.remove();
    };
    document.getElementById('denyBtn_' + username).onclick = function () {
        handleJoinRequest(username, 'deny');
        notif.remove();
    };

    setTimeout(function () { if (notif.parentNode) notif.remove(); }, 30000);
}

function handleJoinRequest(username, action) {
    fetch('/handleRequest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            roomCode:  currentRoom,
            hostToken: currentHostToken,
            username:  username,
            action:    action
        })
    });
}


/* ════════════════════════════════════════════
   HOST CONTROLS
════════════════════════════════════════════ */
function showHostControls() {
    if (document.getElementById('hostBtn')) return;

    var hostBtn = document.createElement('button');
    hostBtn.id        = 'hostBtn';
    hostBtn.textContent = '⚙️ Host';
    hostBtn.onclick   = toggleHostPanel;

    var leaveBtn = document.getElementById('leaveBtn');
    leaveBtn.parentNode.insertBefore(hostBtn, leaveBtn);
}

function toggleHostPanel() {
    var panel = document.getElementById('hostPanel');
    if (panel) { panel.remove(); return; }

    panel = document.createElement('div');
    panel.id = 'hostPanel';
    panel.style.cssText = [
        'position:absolute',
        'top:60px',
        'right:16px',
        'background:rgba(8,8,18,0.97)',
        'border:0.5px solid rgba(92,78,240,0.3)',
        'border-radius:14px',
        'padding:12px',
        'z-index:100',
        'display:flex',
        'flex-direction:column',
        'gap:8px',
        'min-width:160px',
        'box-shadow:0 10px 40px rgba(0,0,0,0.6)',
        'backdrop-filter:blur(20px)',
    ].join(';');

    var lockBtn = document.createElement('button');
    lockBtn.id          = 'lockBtn';
    lockBtn.textContent = '🔒 Lock Room';
    lockBtn.style.cssText = [
        'background:rgba(92,78,240,0.12)',
        'border:0.5px solid rgba(92,78,240,0.28)',
        'color:#b48eff',
        'padding:8px 12px',
        'border-radius:8px',
        'cursor:pointer',
        'font-size:13px',
        'font-family:Inter,sans-serif',
    ].join(';');
    lockBtn.onclick = toggleLock;

    panel.appendChild(lockBtn);
    document.getElementById('chatScreen').appendChild(panel);
}

function toggleLock() {
    fetch('/lockRoom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: currentRoom, hostToken: currentHostToken })
    })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            var btn = document.getElementById('lockBtn');
            if (btn) btn.textContent = data.locked ? '🔓 Unlock Room' : '🔒 Lock Room';
        });
}

function kickUser(username) {
    if (!confirm('Kick ' + username + ' from the room?')) return;
    fetch('/kickUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode: currentRoom, hostToken: currentHostToken, targetUser: username })
    });
}


/* ════════════════════════════════════════════
   MEMBERS DRAWER
════════════════════════════════════════════ */
function openDrawer() {
    document.getElementById('membersDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('show');
}

function closeDrawer() {
    document.getElementById('membersDrawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('show');
}

document.getElementById('membersToggle').onclick  = openDrawer;
document.getElementById('drawerClose').onclick    = closeDrawer;
document.getElementById('drawerBackdrop').onclick = closeDrawer;


/* ════════════════════════════════════════════
   WEBSOCKET / STOMP
════════════════════════════════════════════ */
function connectToRoom(room, name) {
    var socket = new SockJS('/chat');
    stompClient        = Stomp.over(socket);
    stompClient.debug  = null;

    stompClient.connect({}, function () {
        document.getElementById('sendBtn').disabled = false;

        stompClient.subscribe('/topic/messages/' + room, function (frame) {
            handleIncomingMessage(JSON.parse(frame.body));
        });

        stompClient.subscribe('/topic/typing/' + room, function (frame) {
            handleTypingEvent(JSON.parse(frame.body));
        });

        stompClient.subscribe('/topic/members/' + room, function (frame) {
            updateMemberList(JSON.parse(frame.body).message);
        });

        stompClient.subscribe('/topic/roomStatus/' + room, function (frame) {
            var data = JSON.parse(frame.body);
            showSystemMessage(data.locked ? 'Room locked by host 🔒' : 'Room unlocked by host 🔓');
        });

        stompClient.subscribe('/topic/kick/' + room, function (frame) {
            var data = JSON.parse(frame.body);
            if (data.kickedUser === currentUser) {
                alert('You have been kicked by the host! 👢');
                document.getElementById('leaveBtn').click();
            } else {
                showSystemMessage(data.kickedUser + ' was kicked by the host 👢');
            }
        });

        stompClient.subscribe('/topic/hostNotify/' + room, function (frame) {
            if (!currentHostToken) return;
            var data = JSON.parse(frame.body);
            showJoinRequestNotification(data.username);
        });

        /* Load chat history */
        fetch('/history/' + room)
            .then(function (res) { return res.json(); })
            .then(function (messages) {
                var emptyState = document.getElementById('emptyState');
                if (emptyState) emptyState.remove();
                messages.forEach(renderMessage);
            });

        /* Announce join */
        stompClient.send('/app/join/' + room, {}, JSON.stringify({
            sender:  name,
            message: name + ' joined ✦',
            room:    room,
            type:    'JOIN'
        }));
    });
}

function handleIncomingMessage(data) {
    if (data.type === 'JOIN') {
        showSystemMessage(data.sender + ' joined the room ✦');
        if (data.sender !== currentUser) soundJoin();
    } else if (data.type === 'LEAVE') {
        showSystemMessage(data.sender + ' left the room');
        if (data.sender !== currentUser) soundLeave();
    } else {
        renderMessage(data);
        if (data.sender !== currentUser) soundMessage();
    }
}


/* ════════════════════════════════════════════
   LEAVE ROOM
════════════════════════════════════════════ */
document.getElementById('leaveBtn').onclick = function () {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentRoom');

    if (stompClient) {
        stompClient.send('/app/leave/' + currentRoom, {}, JSON.stringify({
            sender:  currentUser,
            message: currentUser + ' left',
            room:    currentRoom,
            type:    'LEAVE'
        }));
        setTimeout(function () { stompClient.disconnect(); }, 200);
    }

    // Stop recording if active
    // if (isRecording) cancelRecording();

    var hostPanel = document.getElementById('hostPanel');
    var hostBtn   = document.getElementById('hostBtn');
    if (hostPanel) hostPanel.remove();
    if (hostBtn)   hostBtn.remove();

    currentHostToken = null;
    cancelReply();

    document.getElementById('chatScreen').style.display = 'none';
    document.getElementById('chat').innerHTML =
        '<div class="empty-state" id="emptyState">' +
        '<div class="empty-icon">💬</div>' +
        '<p>Be the first to say something…</p>' +
        '</div>';
    document.getElementById('membersList').innerHTML     = '';
    document.getElementById('memberCount').textContent   = '0';
    document.getElementById('membersBadge').textContent  = '0';
    document.getElementById('typingBar').innerHTML       = '';
    document.getElementById('sendBtn').disabled          = true;

    typingUsers.clear();
    amTyping = false;
    closeDrawer();

    document.getElementById('joinScreen').style.display = 'block';
};


/* ════════════════════════════════════════════
   SEND MESSAGE
════════════════════════════════════════════ */
function sendMessage() {
    var content = document.getElementById('messageInput').value.trim();
    if (!content || !stompClient) return;

    var payload = {
        sender: currentUser,
        message: content,
        room: currentRoom,
        type: 'CHAT'
    };

    if (replyingTo) {
        payload.replyToId      = replyingTo.id;
        payload.replyToSender  = replyingTo.sender;
        payload.replyToMessage = replyingTo.message;
    }

    stompClient.send('/app/sendMessage/' + currentRoom, {}, JSON.stringify(payload));
    document.getElementById('messageInput').value = '';
    cancelReply();
    stopTyping();
}

document.getElementById('sendBtn').onclick = sendMessage;

document.getElementById('messageInput').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') sendMessage();
});


/* ════════════════════════════════════════════
   REPLY FEATURE
════════════════════════════════════════════ */
function setReplyTo(msg) {
    replyingTo = {
        id: msg.id,
        sender: msg.sender,
        message: msg.message || ''
    };

    var existing = document.getElementById('replyPreview');
    if (existing) existing.remove();

    var preview = document.createElement('div');
    preview.id = 'replyPreview';
    preview.className = 'reply-preview-bar';

    var previewText =
        replyingTo.message.substring(0, 60) +
        (replyingTo.message.length > 60 ? '...' : ''); + (replyingTo.message.length > 60 ? '...' : '');

    preview.innerHTML =
        '<div class="reply-preview-info">' +
        '<span class="reply-preview-sender">↩️ ' + replyingTo.sender + '</span>' +
        '<span class="reply-preview-text">' + previewText + '</span>' +
        '</div>' +
        '<button class="reply-cancel-btn" onclick="cancelReply()">✕</button>';

    document.querySelector('.chat-footer').before(preview);
    document.getElementById('messageInput').focus();
}

function cancelReply() {
    replyingTo = null;
    var preview = document.getElementById('replyPreview');
    if (preview) preview.remove();
}


/* ════════════════════════════════════════════
   TYPING INDICATOR
════════════════════════════════════════════ */
document.getElementById('messageInput').addEventListener('input', function () {
    if (!stompClient) return;
    if (!amTyping) {
        amTyping = true;
        stompClient.send('/app/typing/' + currentRoom, {}, JSON.stringify({
            sender: currentUser, message: 'typing', room: currentRoom, type: 'TYPING'
        }));
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(stopTyping, 2000);
});

function stopTyping() {
    if (!amTyping || !stompClient) return;
    amTyping = false;
    stompClient.send('/app/typing/' + currentRoom, {}, JSON.stringify({
        sender: currentUser, message: 'stop', room: currentRoom, type: 'STOP_TYPING'
    }));
}

function handleTypingEvent(data) {
    if (data.sender === currentUser) return;
    if (data.type === 'TYPING' || data.message === 'typing') {
        typingUsers.add(data.sender);
    } else {
        typingUsers.delete(data.sender);
    }
    renderTypingBar();
}

function renderTypingBar() {
    var bar = document.getElementById('typingBar');
    if (typingUsers.size === 0) { bar.innerHTML = ''; return; }
    var names = Array.from(typingUsers);
    var label;
    if (names.length === 1)      label = names[0] + ' is typing';
    else if (names.length === 2) label = names[0] + ' and ' + names[1] + ' are typing';
    else                         label = names[0] + ' and ' + (names.length - 1) + ' others are typing';
    bar.innerHTML =
        '<div class="typing-dots"><i></i><i></i><i></i></div><span>' + label + '</span>';
}


/* ════════════════════════════════════════════
   MEMBER LIST
════════════════════════════════════════════ */
function updateMemberList(csvNames) {
    var names = (csvNames || '').split(',').filter(Boolean);
    var list  = document.getElementById('membersList');
    list.innerHTML = '';

    document.getElementById('memberCount').textContent  = names.length;
    document.getElementById('membersBadge').textContent = names.length;

    names.forEach(function (name, index) {
        var item = document.createElement('div');
        item.className            = 'member-item';
        item.style.animationDelay = (index * 0.04) + 's';

        var avatar = document.createElement('div');
        avatar.className        = 'member-avatar-sm';
        avatar.style.background = getAvatarColor(name);
        avatar.textContent      = name.charAt(0).toUpperCase();

        var nameEl = document.createElement('div');
        nameEl.className   = 'member-name' + (name === currentUser ? ' is-you' : '');
        nameEl.textContent = name === currentUser ? name + ' (you)' : name;

        item.append(avatar, nameEl);

        if (currentHostToken && name !== currentUser) {
            var kickBtn = document.createElement('button');
            kickBtn.textContent = '👢';
            kickBtn.title       = 'Kick ' + name;
            kickBtn.style.cssText = 'margin-left:auto;background:transparent;border:none;cursor:pointer;font-size:14px;opacity:0.6;';
            kickBtn.onclick = function () { kickUser(name); };
            item.appendChild(kickBtn);
        } else {
            var dot = document.createElement('div');
            dot.className = 'member-online';
            item.appendChild(dot);
        }

        list.appendChild(item);
    });
}


/* ════════════════════════════════════════════
   EMOJI PANEL
════════════════════════════════════════════ */
var EMOJI_LIST = [];
var emojiPanel = document.getElementById('emojiPanel');

fetch('/emojis')
    .then(function (r) { return r.json(); })
    .then(function (data) {
        EMOJI_LIST = data.map(function (e) { return e.character; });
        buildEmojiPanel();
    })
    .catch(function () {
        EMOJI_LIST = [
            '😀','😂','🥰','😎','🤔','😅','🔥','✨','👍','❤️',
            '🎉','💯','😭','🤣','👀','💀','🙏','😤','🥳','💪',
            '🫡','🫶','🤝','💥','🌟','⚡','🎯','💫','🤯','👏',
            '😍','🤩','🥹','😇','🤗','😏','😒','🙄','😬','🤫'
        ];
        buildEmojiPanel();
    });

function buildEmojiPanel() {
    emojiPanel.innerHTML = '';
    EMOJI_LIST.forEach(function (emoji) {
        var btn       = document.createElement('button');
        btn.className = 'ep-btn';
        btn.textContent = emoji;
        btn.onclick = function () {
            var input = document.getElementById('messageInput');
            input.value += emoji;
            input.focus();
            emojiPanel.classList.remove('show');
        };
        emojiPanel.appendChild(btn);
    });
}

document.getElementById('emojiToggle').onclick = function (e) {
    e.stopPropagation();
    emojiPanel.classList.toggle('show');
};

document.addEventListener('click', function () { emojiPanel.classList.remove('show'); });
emojiPanel.addEventListener('click', function (e) { e.stopPropagation(); });


/* ════════════════════════════════════════════
   RENDER MESSAGES
════════════════════════════════════════════ */
function showSystemMessage(text) {
    var chat       = document.getElementById('chat');
    var emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.remove();

    var el        = document.createElement('div');
    el.className  = 'system-msg';
    el.textContent = text;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
}

function renderMessage(msg) {
    var chat       = document.getElementById('chat');
    var emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.remove();

    var isSelf = msg.sender === currentUser;

    var row = document.createElement('div');
    row.className = 'msg-row ' + (isSelf ? 'self' : 'other');
    if (msg.id) row.dataset.msgId = msg.id;

    var avatar = document.createElement('div');
    avatar.className        = 'msg-avatar';
    avatar.style.background = getAvatarColor(msg.sender);
    avatar.textContent      = msg.sender.charAt(0).toUpperCase();

    var content = document.createElement('div');
    content.className = 'msg-content';

    if (!isSelf) {
        var nameEl        = document.createElement('div');
        nameEl.className  = 'msg-name';
        nameEl.textContent = msg.sender;
        content.appendChild(nameEl);
    }

    /* ── Quoted reply bubble (if this msg is a reply) ── */
    if (msg.replyToSender) {
        var quotedDiv = document.createElement('div');
        quotedDiv.className = 'quoted-bubble';
        quotedDiv.innerHTML =
            '<div class="quoted-sender">' + msg.replyToSender + '</div>' +
            '<div class="quoted-text">' + (msg.replyToMessage || '').substring(0, 80) + '</div>';
        content.appendChild(quotedDiv);
    }

    /* ── Message bubble ── */
    var bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    bubble.textContent = msg.message;

    content.appendChild(bubble);

    /* ── Timestamp + Reply button row ── */
    var metaRow = document.createElement('div');
    metaRow.className = 'msg-meta-row';

    var time = document.createElement('div');
    time.className  = 'msg-time';
    time.textContent = formatTime(msg.timestamp ? new Date(msg.timestamp) : new Date());
    metaRow.appendChild(time);

    /* Reply button — shows on hover */
    var replyBtn = document.createElement('button');
    replyBtn.className = 'msg-reply-btn';
    replyBtn.title     = 'Reply';
    replyBtn.textContent = '↩️';
    replyBtn.onclick = function (e) {
        e.stopPropagation();
        setReplyTo(msg);
    };
    metaRow.appendChild(replyBtn);

    content.appendChild(metaRow);

    /* Show reply button on hover */
    row.addEventListener('mouseenter', function () { replyBtn.style.opacity = '1'; });
    row.addEventListener('mouseleave', function () { replyBtn.style.opacity = '0'; });

    row.append(avatar, content);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
}


/* ════════════════════════════════════════════
   AUTO-REJOIN ON REFRESH
════════════════════════════════════════════ */
window.addEventListener('load', function () {
    var savedUser = sessionStorage.getItem('currentUser');
    var savedRoom = sessionStorage.getItem('currentRoom');
    if (savedUser && savedRoom) {
        document.getElementById('nameInput').value = savedUser;
        document.getElementById('roomInput').value = savedRoom;
        enterChat();
    }
});

function showWaitingScreen(name, room) {
    document.getElementById('joinScreen').style.display = 'none';

    var waitDiv = document.createElement('div');
    waitDiv.id = 'waitingScreen';
    waitDiv.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--bg);z-index:20;';
    waitDiv.innerHTML = `
        <div style="font-size:40px">⏳</div>
        <div style="font-family:Syne,sans-serif;font-size:18px;font-weight:700;color:#fff">Waiting for host approval</div>
        <div style="color:var(--muted);font-size:13px">Host will approve or deny your request</div>
        <button onclick="cancelRequest('${room}')" style="margin-top:8px;padding:8px 20px;background:transparent;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;cursor:pointer;">Cancel</button>
    `;
    document.body.appendChild(waitDiv);

    var tempSocket = new SockJS('/chat');
    var tempStomp  = Stomp.over(tempSocket);
    tempStomp.debug = null;
    tempStomp.connect({}, function () {
        tempStomp.subscribe('/topic/joinResponse/' + room, function (frame) {
            var data = JSON.parse(frame.body);
            if (data.username === name) {
                document.getElementById('waitingScreen').remove();
                if (data.approved) {
                    proceedToRoom(name, room);
                } else {
                    alert('Your join request was denied by the host.');
                    document.getElementById('joinScreen').style.display = 'block';
                }
                tempStomp.disconnect();
            }
        });
    });
}

function cancelRequest(room) {
    var waitScreen = document.getElementById('waitingScreen');
    if (waitScreen) waitScreen.remove();
    document.getElementById('joinScreen').style.display = 'block';
}