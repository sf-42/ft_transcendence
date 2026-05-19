import { html/* , escapeHtml */ } from './utils/html.ts';
import { getToken, getUserById, getUsernameByID, getConnectedUserID, type User } from './utils/usersManagement.ts';
import http from './utils/http.ts';
import { handleGameInviteAccept, handleTournamentInviteAccept, showInviteNotification, showNotification } from './utils/ToastifyNotification.ts';
import { AuthManager } from './utils/AuthManager.ts';
import { Player } from './classes/Player.ts';
import { navigateTo } from './main.ts';

export enum Tab { CHAT = 'chat', FRIENDS = 'friends' }
export enum FriendTab { LIST = 'list', SEARCH = 'search', INVITES = 'invites', BLOCKED = 'blocked' }

export interface Friend {
	id: number;
	username: string;
	status: 'accepted' | 'pending' | 'declined';
	isOnline?: boolean;
}

interface FriendInvite {
	created_at: string,
	id: number,
	sender: number,
	status: string,
	user1_id: number,
	user2_id: number
}

function addNotificationBadge(elem: HTMLElement, position: string = "-top-1 -end-1", id: string = "notif-badge") {
	const badge = document.createElement('div');
	badge.id = id;
	badge.className = `absolute hidden w-3 h-3 bg-red-600 rounded-full ${position}`;
	elem.appendChild(badge);
}

export class SocialOverlay {
	private _overlay: HTMLElement;
	private _title: HTMLElement;
	private _content: HTMLElement;
	private _tabTitles: HTMLElement;
	private _friendsTitle: HTMLElement;
	private _friendsTab: HTMLElement;
	private _friendsTabTitles: HTMLElement;
	private _friendsListTitle: HTMLElement;
	private _friendsList: HTMLElement;
	private _searchTitle: HTMLElement;
	private _searchContainer: HTMLElement;
	private _invitesTitle: HTMLElement;
	private _invitesContainer: HTMLElement;
	private _blockedTitle: HTMLElement;
	private _blockedContainer: HTMLElement;
	private _chatTitle: HTMLElement;
	private _chatContainer: HTMLElement;
	private _chat: HTMLElement;
	private _chatMessagesContainer: HTMLElement;
	private _chatMessages: Map<number, HTMLElement> = new Map();
	private _lastSender: Map<number, string> = new Map();
	private _chatInput: HTMLInputElement;
	private _activeChats: HTMLElement;
	private _searchInput: HTMLInputElement;
	private _searchResults: HTMLElement;
	private _active: boolean;
	private _activeTab: Tab;
	private _activeFriendTab: FriendTab;
	private _ws: WebSocket | null = null;
	private _wsDisconnectedByServer: boolean = false; // Flag to prevent auto-reconnect after session_replaced
	private _selectedFriendId: number | null = null;
	private _arrowElement: HTMLElement | null = null;
	private _friendInvitesNotifications: number = 0;
	private _chatNotifications: Map<number, boolean> = new Map();
	private _friendStatuses: Map<number, boolean> = new Map();
	private _userId: number | null = null;
	private readonly _overlayClass = "absolute -right-10 top-1/2 transform -translate-y-1/2 p-5 pr-10 \
		rounded-l-4xl border-8 border-solid border-white bg-black/10 backdrop-blur-sm flex \
		transition-all ease-in-out animate-zoomin z-50 font-jersey text-white";
	private readonly _tabClass = "max-h-[90%] flex flex-col bg-black/20 rounded-lg p-2 m-2 overflow-y-auto \
		scrollbar-thumb-rounded-full scrollbar-track-rounded-full scrollbar scrollbar-thumb-slate-700 scrollbar-track-white/10 scrollbar-w-0.5";
	private readonly _contentClass = "max-w-60";
	private readonly _tabNamesClass = "relative mx-2 text-4xl decoration-4 underline-offset-4 cursor-pointer hover:opacity-80 transition overflow-visible";
	private readonly _friendTabNamesClass = "relative mx-2 text-lg decoration-4 underline-offset-4 cursor-pointer hover:opacity-80 transition overflow-visible";
	private readonly _chatMessagesClass = "flex-1 overflow-y-auto mb-4 space-y-2 text-xs min-h-0";

	constructor() {
		this._active = false;
		this._activeTab = Tab.FRIENDS;
		this._activeFriendTab = FriendTab.LIST;
		this._overlay = document.createElement('div');
		this._overlay.className = this._overlayClass;

		const txtClass = "text-3xl sm:text-4xl text-center";

		this._title = document.createElement('div');
		this._title.appendChild(
			html`
			<div id="socialTitle" class="relative flex flex-col items-center space-y-0.5 cursor-pointer">
				<div class="text-center"><span class="${txtClass}" id="arrow-indicator">${this._active ? '»' : '«'}</span></div>
				<div class="text-center"><span class="${txtClass}">S</span></div>
				<div class="text-center"><span class="${txtClass}">O</span></div>
				<div class="text-center"><span class="${txtClass}">C</span></div>
				<div class="text-center"><span class="${txtClass}">I</span></div>
				<div class="text-center"><span class="${txtClass}">A</span></div>
				<div class="text-center"><span class="${txtClass}">L</span></div>
				<div class="absolute hidden w-3 h-3 bg-red-600 rounded-full top-11 -end-0.5" id="notif-badge"></div>
			</div>
			`
		);

		this._overlay.appendChild(this._title);

		this._content = document.createElement('div');
		this._content.className = this._active ? this._contentClass : "hidden";

		// Tab headers
		this._tabTitles = document.createElement('div');
		this._tabTitles.className = "mx-4 flex flex-row";

		this._friendsTitle = document.createElement('div');
		this._friendsTitle.className = this._tabNamesClass;
		this._friendsTitle.appendChild(html`<p>Friends</p>`);
		addNotificationBadge(this._friendsTitle, "top-0 -end-2");
		this._tabTitles.appendChild(this._friendsTitle);

		this._chatTitle = document.createElement('div');
		this._chatTitle.className = this._tabNamesClass;
		this._chatTitle.appendChild(html`<p>Chat</p>`);
		addNotificationBadge(this._chatTitle, "top-0 -end-2");
		this._tabTitles.appendChild(this._chatTitle);

		if (this._activeTab === Tab.FRIENDS)
			this._friendsTitle.classList.add("underline");
		else
			this._chatTitle.classList.add("underline");

		this._content.appendChild(this._tabTitles);

		// Friends tab
		this._friendsTab = document.createElement('div');
		this._friendsTab.className = this._tabClass + " scrollbar-hide";
		this._friendsTabTitles = document.createElement('div');
		this._friendsTabTitles.className = "flex justify-between -ml-1";
		this._friendsTab.appendChild(this._friendsTabTitles);

		// Friends tabs titles
		this._friendsListTitle = document.createElement('div');
		this._friendsListTitle.className = this._friendTabNamesClass;
		this._friendsListTitle.innerText = "List";
		this._searchTitle = document.createElement('div');
		this._searchTitle.className = this._friendTabNamesClass;
		this._searchTitle.innerText = "Search";
		this._invitesTitle = document.createElement('div');
		this._invitesTitle.className = this._friendTabNamesClass;
		this._invitesTitle.innerText = "Invites";
		addNotificationBadge(this._invitesTitle);
		this._blockedTitle = document.createElement('div');
		this._blockedTitle.className = this._friendTabNamesClass;
		this._blockedTitle.innerText = "Blocked";

		this._friendsTabTitles.appendChild(this._friendsListTitle);
		this._friendsTabTitles.appendChild(this._searchTitle);
		this._friendsTabTitles.appendChild(this._invitesTitle);
		this._friendsTabTitles.appendChild(this._blockedTitle);

		// Friends list
		this._friendsList = document.createElement('div');
		this._friendsList.className = "m-2 max-h-96 overflow-y-autospace-y-2";
		this._friendsList.innerHTML = '';
		this._friendsTab.appendChild(this._friendsList);

		// Search tab
		this._searchContainer = document.createElement('div');
		const searchForm = document.createElement('form');
		searchForm.className = "m-2 space-y-3";

		const searchLabel = document.createElement('label');
		searchLabel.className = "text-lg";
		searchLabel.textContent = "Search by username:";

		this._searchInput = document.createElement('input');
		this._searchInput.type = "text";
		this._searchInput.placeholder = "Enter username...";
		this._searchInput.className = "w-full px-3 py-2 rounded bg-white/20 placeholder-white/50 text-lg";

		const searchBtn = document.createElement('button');
		searchBtn.type = "submit";
		searchBtn.textContent = "Search";
		searchBtn.className = "w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-lg transition cursor-pointer";

		searchBtn.addEventListener('click', (e) => {
			e.preventDefault();
			this.searchFriends();
		});

		this._searchResults = document.createElement('div');
		this._searchResults.className = "flex flex-col space-y-2 max-h-48 overflow-y-auto";

		searchForm.appendChild(searchLabel);
		searchForm.appendChild(this._searchInput);
		searchForm.appendChild(searchBtn);
		this._searchContainer.appendChild(searchForm);
		this._searchContainer.appendChild(this._searchResults);
		this._friendsTab.appendChild(this._searchContainer);

		// Friend invites tab
		this._invitesContainer = document.createElement('div');
		this._invitesContainer.className = "m-2";
		this._friendsTab.appendChild(this._invitesContainer);

		// Blocked users list
		this._blockedContainer = document.createElement('div');
		this._blockedContainer.className = "m-2 max-h-96 overflow-y-autospace-y-2";
		this._blockedContainer.innerHTML = '';
		this._friendsTab.appendChild(this._blockedContainer);

		// Chat tab
		this._chatContainer = document.createElement('div');
		this._chatContainer.className = "flex flex-col max-h-[85%] overflow-hidden m-2";

		this._chat = document.createElement('div');
		this._chat.className = "flex flex-col flex-grow bg-black/20 rounded-lg p-2 flex-1 min-h-0 font-code";

		const chatHeader = document.createElement('div');
		chatHeader.className = "mb-2 border-b border-white/20";
		chatHeader.innerHTML = '<div id="chat-friend-name" class="text-lg font-jersey">Select a friend to chat</div>';
		this._chat.appendChild(chatHeader);

		this._chatMessagesContainer = document.createElement('div');
		this._chatMessagesContainer.className = "flex-1 flex-grow overflow-y-auto mb-4 relative max-h-max scrollbar-hide";
		this._chat.appendChild(this._chatMessagesContainer);

		const inputContainer = document.createElement('div');
		inputContainer.className = "flex gap-2 w-full";

		this._chatInput = document.createElement('input');
		this._chatInput.type = "text";
		this._chatInput.placeholder = "Type message...";
		this._chatInput.className = "flex-1 min-w-0 px-2 py-1 rounded bg-white/20 placeholder-white/50 text-xs";
		this._chatInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') this.sendMessage();
		});

		const sendBtn = document.createElement('button');
		sendBtn.textContent = "Send";
		sendBtn.className = "px-3 py-1 bg-green-500 hover:bg-green-600 rounded text-xs transition flex-shrink-0";
		sendBtn.addEventListener('click', () => this.sendMessage());

		inputContainer.appendChild(this._chatInput);
		inputContainer.appendChild(sendBtn);
		this._chat.appendChild(inputContainer);
		this._chatContainer.appendChild(this._chat);

		this._activeChats = document.createElement('div');
		this._activeChats.className = "grid grid-cols-2 gap-1 overflow-y-auto mt-2 p-1 max-h-24 min-h-0 flex-shrink-0 overflow-x-visible scrollbar-hide";
		this._chatContainer.appendChild(this._activeChats);

		if (this._activeFriendTab === FriendTab.LIST) {
			this._searchContainer.classList.add("hidden");
			this._invitesContainer.classList.add("hidden");
			this._blockedContainer.classList.add("hidden");
			this._friendsListTitle.classList.add("underline");
		}
		else if (this._activeFriendTab === FriendTab.SEARCH) {
			this._friendsList.classList.add("hidden");
			this._invitesContainer.classList.add("hidden");
			this._blockedContainer.classList.add("hidden");
			this._searchTitle.classList.add("underline");
		}
		else if (this._activeFriendTab === FriendTab.INVITES) {
			this._friendsList.classList.add("hidden");
			this._searchContainer.classList.add("hidden");
			this._blockedContainer.classList.add("hidden");
			this._invitesTitle.classList.add("underline");
		}
		else {
			this._searchContainer.classList.add("hidden");
			this._searchContainer.classList.add("hidden");
			this._invitesContainer.classList.add("hidden");
			this._blockedTitle.classList.add("underline");
		}

		if (this._activeTab === Tab.FRIENDS)
			this._chatContainer.classList.add("hidden");
		else
			this._friendsTab.classList.add("hidden");

		this._content.appendChild(this._friendsTab);
		this._content.appendChild(this._chatContainer);
		this._overlay.appendChild(this._content);

		this._arrowElement = this._overlay.querySelector('#arrow-indicator');
		document.body.appendChild(this._overlay);

		// Event listeners
		this._title.addEventListener("click", () => {
			if (this._active) this.closeOverlay();
			else this.openOverlay();
		});

		this._title.addEventListener('mouseenter', () => {
			if (!this._active)
				this._overlay.classList.add('-translate-x-4', 'shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)]');
			else
				this._overlay.classList.add('shadow-[inset_0_0_15px_2px_rgba(255,100,100,0.7)]');
		});
		this._title.addEventListener('mouseleave', () => {
			this._overlay.classList.remove('-translate-x-4', 'shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)]', 'shadow-[inset_0_0_15px_2px_rgba(255,100,100,0.7)]');
		});

		// Tab switching
		this._friendsTitle.addEventListener("click", () => this.switchTab(Tab.FRIENDS));
		this._chatTitle.addEventListener("click", () => this.switchTab(Tab.CHAT));

		this._friendsListTitle.addEventListener('click', () => this.switchFriendsTab(FriendTab.LIST));
		this._searchTitle.addEventListener('click', () => this.switchFriendsTab(FriendTab.SEARCH));
		this._invitesTitle.addEventListener('click', () => this.switchFriendsTab(FriendTab.INVITES));
		this._blockedTitle.addEventListener('click', () => this.switchFriendsTab(FriendTab.BLOCKED));

		AuthManager.isLoggedIn().then((loggedIn) => {
			if (loggedIn) {
				this.initializeChat();
			}
		});
	}

	private switchTab(tab: Tab): void {
		if (this._activeTab === tab)
			return;

		this._activeTab = tab;

		this._friendsTitle.classList.remove("underline");
		this._chatTitle.classList.remove("underline");

		this._friendsTab.classList.add("hidden");
		this._chatContainer.classList.add("hidden");

		if (tab === Tab.FRIENDS) {
			this._friendsTitle.classList.add("underline");
			this._friendsTab.classList.remove("hidden");
			if (this._activeFriendTab === FriendTab.LIST)
				this.loadFriends();
		} else {
			this._chatTitle.classList.add("underline");
			this._chatContainer.classList.remove("hidden");
			this._chatNotifications.set(this._selectedFriendId ?? 0, false);
		}

		this.updateNotificationBadges();
	}

	private switchFriendsTab(friendTab: FriendTab): void {
		if (this._activeFriendTab === friendTab)
			return;

		this._activeFriendTab = friendTab;

		this._friendsListTitle.classList.remove("underline");
		this._searchTitle.classList.remove("underline");
		this._invitesTitle.classList.remove("underline");
		this._blockedTitle.classList.remove("underline");

		this._friendsList.classList.add("hidden");
		this._searchContainer.classList.add("hidden");
		this._invitesContainer.classList.add("hidden");
		this._blockedContainer.classList.add("hidden");

		switch (friendTab) {
			case (FriendTab.LIST): {
				this._friendsList.classList.remove("hidden");
				this._friendsListTitle.classList.add("underline");
				this.loadFriends();
				break;
			}
			case (FriendTab.SEARCH): {
				this._searchContainer.classList.remove("hidden");
				this._searchTitle.classList.add("underline");
				break;
			}
			case (FriendTab.INVITES): {
				this._invitesContainer.classList.remove("hidden");
				this._invitesTitle.classList.add("underline");
				this.loadPendingInvites();
				break;
			}
			case (FriendTab.BLOCKED): {
				this._blockedContainer.classList.remove("hidden");
				this._blockedTitle.classList.add("underline")
				this.loadBlockedUsers();
				break;
			}
		}
	}

	openOverlay(tab?: Tab, friendTab?: FriendTab): void {
		if (!this._active) {
			this._active = true;
			if (this._arrowElement)
				this._arrowElement.textContent = '»';
			this._content.className = this._contentClass;
		}

		if (tab) {
			this.switchTab(tab);
			if (tab === Tab.FRIENDS && friendTab)
				this.switchFriendsTab(friendTab);
		}

		this.updateNotificationBadges();
	}

	closeOverlay(): void {
		if (!this._active)
			return;

		this._active = false;
		if (this._arrowElement)
			this._arrowElement.textContent = '«';
		this._content.className = "hidden";
	}

	showOverlay(): void {
		this._overlay.className = this._overlayClass;
	}

	hideOverlay(): void {
		this._overlay.className = "hidden";
	}

	async openChat(id?: number): Promise<void> {
		this.openOverlay(Tab.CHAT);
		if (id) {
			const user = await getUserById(id);
			const username = user?.username;
			const picture = user?.profilePicture || Player.getIconPathBySkinId(user?.avatar || 0);
			// const username = await getUsernameByID(id);
			this.selectFriend(id, username, picture);
		}
	}

	/**
	 * Initialize chat system with authenticated user
	 */
	async initializeChat(): Promise<void> {
		// console.log('[Chat] initializeChat called');
		if (! await AuthManager.isLoggedIn()) {
			// console.log('[Chat] Not logged in, skipping');
			return;
		}
		if (!this._userId || Number.isNaN(this._userId))
			this._userId = Number(await getConnectedUserID());
		// console.log('[Chat] userId:', this._userId);
		// Reset the disconnected flag when initializing (new login)
		this._wsDisconnectedByServer = false;
		this.connectWebSocket();
		this.loadFriends();
	}

	/**
	 * Connect to chat WebSocket
	 */
	private async connectWebSocket(): Promise<void> {
		// console.log('[Chat] connectWebSocket called, wsDisconnectedByServer:', this._wsDisconnectedByServer);
		// Don't reconnect if we were kicked by server (session replaced)
		if (this._wsDisconnectedByServer) {
			// console.log('[Chat] Not reconnecting - session was replaced');
			return;
		}

		try {
			// WebSocket uses cookies automatically (browser sends them with the handshake)
			// The gateway reads the access_token cookie and sets x-user-id header
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const wsUrl = `${protocol}//${window.location.host}/chat/ws`;
			// console.log('[Chat] Connecting to:', wsUrl);

			this._ws = new WebSocket(wsUrl);

			this._ws.onopen = () => {
				// console.log('[Chat] WebSocket connected!');
			};

			this._ws.onmessage = (event: MessageEvent) => {
				this.handleChatMessage(event.data);
			};

			this._ws.onerror = (error: Event) => {
				console.error('[Chat] WebSocket error:', error);
				showNotification("Connection error", "error");
			};

			this._ws.onclose = () => {
				// console.log('[Chat] Disconnected from chat service');
				// Only auto-reconnect if not kicked by server
				if (!this._wsDisconnectedByServer) {
					setTimeout(() => this.connectWebSocket(), 3000);
				}
			};
		} catch (error) {
			console.error('[Chat] Failed to connect to chat:', error);
			showNotification("Failed to connect to chat", "error");
		}
	}

	/**
	 * Handle incoming chat messages
	 */
	private async handleChatMessage(data: string): Promise<void> {
		try {
			const message = JSON.parse(data);

			if (message.type === 'error') {
				showNotification(`Error: ${message.message}`, "error");
			}
			// Handle session replacement (another login kicked us out)
			else if (message.type === 'session_replaced' || message.type === 'force_disconnect') {
				showNotification(message.message || "You have been disconnected", "error");
				// Set flag to prevent auto-reconnect
				this._wsDisconnectedByServer = true;
				// Close the websocket
				if (this._ws) {
					this._ws.close();
					this._ws = null;
				}
				// Do a full logout (clear cookies, local storage, redirect to login)
				const { AuthManager } = await import('./utils/AuthManager.ts');
				await AuthManager.logout();
				return;
			}
			else if (message.type === 'message') {
				const username = await getUsernameByID(message.from);
				if (!this._active || this._activeTab !== Tab.CHAT || this._selectedFriendId !== message.from)
					showNotification(`You received a message from ${username}`, "info", "chat", message.from);
				this.addChatMessage(username || 'Friend', message.content || message.message || data, message.from);
			}
			else if (message.type === 'message_sent') {
				// console.log('Message delivered to user', message.to);
			}
			else if (message.type === 'friend-request') {
				showNotification("You received a new friend request.", "info", "friendInvite");
				if (this._active && this._activeTab === Tab.FRIENDS && this._activeFriendTab === FriendTab.INVITES)
					this.loadPendingInvites();
				this._friendInvitesNotifications++;
			}
			else if (message.type === 'game-invite') {
				const username = await getUsernameByID(message.from);
				showInviteNotification(`${username} invited you to a game.`, "game-invite", message.content);
				this.addChatInvite(username || 'Friend', 'You have been invited to a game.', message.from, 'game-invite', message.content);
			}
			else if (message.type === 'tournament-invite') {
				const username = await getUsernameByID(message.from);
				showInviteNotification(`${username} invited you to a tournament.`, "tournament-invite", message.content);
				this.addChatInvite(username || 'Friend', 'You have been invited to a tournament.', message.from, 'tournament-invite', message.content);
			}
			else if (message.type === 'friend_status') {
				const friendId = message.userId;
				const isOnline = message.isOnline;

				this._friendStatuses.set(friendId, isOnline);

				// Update UI if friend is in list
				const friendEl = this._friendsList.querySelector(`[data-friend-id="${friendId}"]`);
				if (friendEl) {
					const statusDot = friendEl.querySelector('.status-dot');
					if (statusDot) {
						if (isOnline)
							statusDot.classList.replace('bg-red-500', 'bg-green-500');
						else
							statusDot.classList.replace('bg-green-500', 'bg-red-500');
					}
				}

				// Update chat header if active
				if (this._selectedFriendId === friendId) {
					const chatHeader = this._chat.querySelector('#chat-friend-name');
					const statusDot = chatHeader?.querySelector('.status-dot');
					if (statusDot) {
						if (isOnline)
							statusDot.classList.replace('bg-red-500', 'bg-green-500');
						else
							statusDot.classList.replace('bg-green-500', 'bg-red-500');
					}
				}
			}
			else {
				// Format inconnu
				showNotification(data, 'info');
			}
			this.updateNotificationBadges();
		} catch (error) {
			console.error('Failed to parse message:', error);
			this.addChatMessage('System', data);
		}
	}

	/**
	 * Send a chat message
	 */
	private sendMessage(): void {
		const content = this._chatInput.value;
		if (!content || !this._selectedFriendId) {
			this.addChatMessage('System', 'Select a friend first');
			return;
		}

		if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
			// this.addChatMessage('System', 'Not connected to chat service');
			showNotification('Not connected to chat service', 'error');
			return;
		}

		try {
			this._ws.send(JSON.stringify({
				type: "message",
				to: this._selectedFriendId,
				content: content
			}));
			this.addChatMessage('You', content, this._selectedFriendId);
			this._chatInput.value = '';
		} catch (error) {
			console.error('Failed to send message:', error);
			showNotification("Failed to send message", "error");
		}
	}

	/**
	 * Add a message to the chat UI
	 */
	private addChatMessage(sender: string, text: string, id: number = 0): void {
		const targetId = id ?? this._selectedFriendId;

		if (targetId === null) {
			console.warn('No chat selected.');
			return;
		}

		let chatDiv = this._chatMessages.get(targetId);

		if (!chatDiv) {
			chatDiv = document.createElement('div');
			chatDiv.className = this._chatMessagesClass + " hidden";
			chatDiv.dataset.friendId = targetId.toString();
			this._chatMessagesContainer.appendChild(chatDiv);
			this._chatMessages.set(targetId, chatDiv);
			this.updateActiveChats();
		}

		let lastSender = this._lastSender.get(targetId);

		if (lastSender === undefined || lastSender !== sender) {
			const senderElem = document.createElement('div');

			let nameColor: string;
			if (sender === 'You')
				nameColor = 'text-green-400 text-right';
			else if (sender === 'System')
				nameColor = 'text-red-400';
			else
				nameColor = 'text-blue-400';

			senderElem.className = `w-full px-1 mb-0 font-bold text-xs ${nameColor}`;
			senderElem.innerText = sender;
			chatDiv.appendChild(senderElem);
			this._lastSender.set(targetId, sender);
		}

		const msgWrapper = document.createElement('div');
		msgWrapper.className = `w-full flex ${sender === 'You' ?  'justify-end' : 'justify-start'} mb-1`;

		const msgEl = document.createElement('div');
		msgEl.className = `text-xs text-white/90 p-1 rounded bg-white/5 whitespace-normal break-words max-w-[90%] w-fit ${sender === 'You' ? 'text-right' : ''}`;
		msgEl.innerText = text;
		msgWrapper.appendChild(msgEl);
		chatDiv.appendChild(msgWrapper);
		chatDiv.scrollTop = chatDiv.scrollHeight;
		this._chatMessagesContainer.scrollTop = this._chatMessagesContainer.scrollHeight;

		if (sender !== "You" && (!this._active || this._activeTab !== Tab.CHAT || id !== this._selectedFriendId)) {
			if (!this._chatNotifications.get(id))
				this._chatNotifications.set(id, true);
		}
	}

	private addChatInvite(sender: string, text: string, id: number, type: 'game-invite' | 'tournament-invite', joinId: number): void {
		const targetId = id ?? this._selectedFriendId;

		if (targetId === null) {
			console.warn('No chat selected.');
			return;
		}

		let chatDiv = this._chatMessages.get(targetId);

		if (!chatDiv) {
			chatDiv = document.createElement('div');
			chatDiv.className = this._chatMessagesClass + " hidden";
			chatDiv.dataset.friendId = targetId.toString();
			this._chatMessagesContainer.appendChild(chatDiv);
			this._chatMessages.set(targetId, chatDiv);
			this.updateActiveChats();
		}

		let lastSender = this._lastSender.get(targetId);

		if (lastSender === undefined || lastSender !== sender) {
			const senderElem = document.createElement('div');

			let nameColor: string;
			if (sender === 'You')
				nameColor = 'text-green-400 text-right';
			else if (sender === 'System')
				nameColor = 'text-red-400';
			else
				nameColor = 'text-blue-400';

			senderElem.className = `w-full px-1 mb-0 font-bold text-xs ${nameColor}`;
			senderElem.innerText = sender;
			chatDiv.appendChild(senderElem);
			this._lastSender.set(targetId, sender);
		}

		const msgEl = document.createElement('div');
		msgEl.className = 'text-xs text-white/90 p-1 rounded bg-white/5';
		msgEl.innerText = text;
		const buttonContainer = document.createElement('div');
		buttonContainer.className = 'flex items-center justify-center';
		const joinBtn = document.createElement('button');
		joinBtn.className = 'px-2 py-0.5 m-2 bg-green-600/70 hover:bg-green-600 rounded transition cursor-pointer';
		joinBtn.textContent = 'Join';
		joinBtn.onclick = (e) => {
			e.stopPropagation();
			if (type === 'game-invite')
				handleGameInviteAccept(joinId);
			else
				handleTournamentInviteAccept(joinId);
		}
		buttonContainer.appendChild(joinBtn);
		msgEl.appendChild(buttonContainer);
		chatDiv.appendChild(msgEl);
		chatDiv.scrollTop = chatDiv.scrollHeight;
		this._chatMessagesContainer.scrollTop = this._chatMessagesContainer.scrollHeight;

		if (sender !== "You" && (!this._active || this._activeTab !== Tab.CHAT || id !== this._selectedFriendId)) {
			if (!this._chatNotifications.get(id))
				this._chatNotifications.set(id, true);
		}
	}

	/**
	 * Load friends list from API
	 */
	private async loadFriends(): Promise<void> {
		try {
			const response = await http.get('/chat/friends', {});
			
			// Handle 204 No Content or null data
			const friends = response.data?.data || response.data || [];
			this.renderFriendsUI(Array.isArray(friends) ? friends : []);
		} catch (error) {
			console.error('Error loading friends:', error);
			this.renderFriendsUI([]);
		}
	}

	/**
	 * Render friends UI with action buttons
	 */
	private renderFriendsUI(friends: any[]): void {
		this._friendsList.innerHTML = '';

		// Populate status map
		friends.forEach((friend: any) => {
			if (friend.id !== undefined && friend.isOnline !== undefined) {
				this._friendStatuses.set(friend.id, friend.isOnline);
			}
		});

		if (friends.length === 0) {
			const emptyEl = document.createElement('div');
			emptyEl.className = "text-white/70 text-lg";
			emptyEl.appendChild(html`<p>No friend yet. <br />Use Search tab to add friends!</p>`);
			this._friendsList.appendChild(emptyEl);
			return;
		}

		friends.forEach(async (friend: any) => {
			const friendId = friend.id;
			const user = await getUserById(friendId);
			const username = user?.username;
			const picture = user?.profilePicture || Player.getIconPathBySkinId(user?.avatar || 0);
			const friendEl = document.createElement('div');
			friendEl.className = "my-1 bg-white/10 hover:bg-white/20 rounded-lg transition";

			const topRow = document.createElement('div');
			topRow.className = "p-2 flex items-center";

			const nameBtn = document.createElement('div');
			nameBtn.className = "text-lg hover:text-blue-300 transition cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap flex-grow";
			nameBtn.appendChild(html`
				<div class="flex items-center gap-1">
					<img src="${picture}" class="max-w-6 rounded-full" />
					<p>${username || `User ${friendId}`}</p>
                    <div class="status-dot w-2 h-2 rounded-full flex-shrink-0 ${friend.isOnline ? 'bg-green-500' : 'bg-red-500'} mx-1"></div>
				</div>
			`);
			friendEl.dataset.friendId = friendId.toString();
			nameBtn.addEventListener('click', () => {
				const buttonsRow = friendEl.querySelector(`#friend-buttons-${friendId}`);
				if (buttonsRow) {
					buttonsRow.classList.toggle('hidden');
				}
			});

			topRow.appendChild(nameBtn);
			friendEl.appendChild(topRow);

			const buttonsRow = document.createElement('div');
			buttonsRow.id = `friend-buttons-${friendId}`;
			buttonsRow.className = "hidden p-2 pt-0 grid grid-cols-2 gap-2";

			const btnClass = "flex-1 px-3 py-0.5 bg-blue-600/70 hover:bg-blue-600 rounded transition cursor-pointer text-md";

			const profileBtn = document.createElement('button');
			profileBtn.textContent = "Profile";
			profileBtn.className = "bg-blue-600/70 hover:bg-blue-600 " + btnClass;
			profileBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				navigateTo(`/profile?user=${username}`);
			});

			const chatBtn = document.createElement('button');
			chatBtn.textContent = "Chat";
			chatBtn.className = "bg-green-600/70 hover:bg-green-600 " + btnClass;
			chatBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.selectFriend(friendId, username ? username : 'User ' + friendId.toString(), picture);
			});
			
			const blockBtn = document.createElement('button');
			blockBtn.textContent = "Block";
			blockBtn.className = "bg-red-600/70 hover:bg-red-600" + btnClass;
			blockBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.blockUser(friendId);
			});

			const removeBtn = document.createElement('button');
			removeBtn.textContent = "Remove";
			removeBtn.className = "bg-orange-600/70 hover:bg-orange-600 " + btnClass;
			removeBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.removeFriend(friendId);
			});

			buttonsRow.appendChild(profileBtn);
			buttonsRow.appendChild(chatBtn);
			buttonsRow.appendChild(blockBtn);
			buttonsRow.appendChild(removeBtn);
			friendEl.appendChild(buttonsRow);

			this._friendsList.appendChild(friendEl);
		});
	}

	/**
	 * Search for friends by username
	 */
	private async searchFriends(): Promise<void> {
		const username = this._searchInput.value.trim();
		if (!username) {
			this._searchResults.innerHTML = '<div class="text-white/70 text-lg">Enter a username to search</div>';
			return;
		}

		try {
			const response = await http.get(`/chat/search?username=${encodeURIComponent(username)}`, {});

			if (response.status === 204) {
				this._searchResults.innerHTML = '<div class="text-white/70 text-lg">No user found</div>';
				return;
			}

			const data = response.data;
			const user = data.data || null;
			this.renderSearchResults(user);
		} catch (error) {
			console.error('Search error:', error);
			this._searchResults.innerHTML = '<div class="text-red-400 text-sm">Search failed</div>';
		}
	}

	/**
	 * Render search results
	 */
	private async renderSearchResults(user: any): Promise<void> {
		let alreadyFriend: boolean = false;
		this._searchResults.innerHTML = '';

		if (!user) {
			const emptyEl = document.createElement('div');
			emptyEl.className = "text-white/70 text-lg p-2";
			emptyEl.textContent = "No user found";
			this._searchResults.appendChild(emptyEl);
			return;
		}

		try {
			const response = await http.get('/chat/friends', {});

			const data = response.data;
			const friends = data?.data || [];

			friends.forEach((friend: Friend) => {
				if (friend === user.id) {
					alreadyFriend = true;
					return;
				}
			});
		} catch (error) {
			console.error('Error while getting friends:', error);
			return;
		}

		const userEl = document.createElement('div');
		userEl.className = "p-2 bg-blue-600/30 hover:bg-blue-600/50 rounded-lg transition space-y-1";

		const userName = document.createElement('div');
		userName.className = "text-lg";
		userName.textContent = user.username || `User ${user.id}`;
		userEl.appendChild(userName);

		if (!alreadyFriend) {
			const addBtn = document.createElement('button');
			addBtn.textContent = "Send Friend Request";
			addBtn.className = "w-full px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-lg transition cursor-pointer";
			addBtn.addEventListener('click', () => this.addFriend(user.id));
			userEl.appendChild(addBtn);
		}
		else {
			const infoDiv = document.createElement('div');
			infoDiv.textContent = "This user is already your friend.";
			infoDiv.className = "w-full px-3 py-1 bg-gray-600 rounded text-lg";
			userEl.appendChild(infoDiv);
		}

		this._searchResults.appendChild(userEl);
	}

	/**
	 * Send friend request
	 */
	private async addFriend(friendId: number): Promise<void> {
		try {
			await http.post('/chat/friends', { friend: friendId });

			showNotification("Friend request sent", "info");

			if (this._ws && this._ws.readyState === WebSocket.OPEN) {
				this._ws.send(JSON.stringify({
					type: 'friend-request',
					to: friendId,
					message: 'You have a new friend request!'
				}));
			}

			this._searchInput.value = '';
			this._searchResults.innerHTML = '';
			this.loadFriends();
		} catch (error: any) {
			console.error('Add friend error:', error);
			const msg = error.data?.message || error.message || "Failed to send friend request";
			showNotification(msg, "error");
		}
	}

	private async loadBlockedUsers(): Promise<void> {
		try {
			this._blockedContainer.innerHTML = '';

			const response = await http.get('/chat/blocked', {});

			const blocked = response.data;

			if (blocked.length === 0) {
				const emptyEl = document.createElement('div');
				emptyEl.className = "text-white/70 text-lg";
				emptyEl.appendChild(html`<p>No user blocked.</p>`);
				this._blockedContainer.appendChild(emptyEl);
				return;
			}

			const blockedUsers = blocked.data;

			blockedUsers.forEach(async (blockedUser: number) => {
				const username = await getUsernameByID(blockedUser) ?? 'User ' + blockedUser.toString();
				const userElem = document.createElement('div');
				userElem.className = "p-2 my-1 bg-white/10 rounded-lg flex items-center";

				const nameDiv = document.createElement('div');
				nameDiv.className = "text-lg overflow-hidden text-ellipsis whitespace-nowrap flex-grow";
				nameDiv.textContent = username;

				const unblockBtn = document.createElement('button');
				unblockBtn.className = "px-2 py-0.5 bg-green-600/70 hover:bg-green-600 rounded transition cursor-pointer";
				unblockBtn.textContent = "Unblock";
				unblockBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.unblockUser(blockedUser);
				});

				userElem.appendChild(nameDiv);
				userElem.appendChild(unblockBtn);
				this._blockedContainer.appendChild(userElem);
			})
		} catch (error) {

		}
	}

	private async askConfirmation(userId: number, type: "block" | "remove" | "unblock"): Promise<boolean> {
		return new Promise<boolean>(async (resolve) => {
			const confirmationDiv = document.createElement('div');

			const btnClass = "rounded-2xl border-4 border-solid border-white w-full h-[90px] \
				transition-all hover:shadow-[inset_0_0_15px_2px_rgba(255,255,255,0.5)] cursor-pointer duration-300 ease-in-out";
			const username = await getUsernameByID(userId) ?? 'User ' + userId.toString();
			const message = type === "remove" ? `Are you sure you want to remove ${username} from your friend?` : `Are you sure you want to ${type} ${username}?`;

			confirmationDiv.className = "absolute left-0 top-0 h-full w-full backdrop-blur-sm z-50 font-jersey text-white";
			confirmationDiv.appendChild(html`
				<div class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 rounded-4xl border-8 border-solid border-white \
					p-5 m-2 w-[80%] sm:w-1/2 xl:w-[30%] bg-black/10 animate-zoomin backdrop-blur-sm text-center text-3xl xl:text-5xl"
					<p>${message}</p>
					<div class="flex gap-2 mt-2">
						<button id="confirmation-yes" class="${btnClass} hover:border-green-800 hover:text-green-800 hover:bg-green-800/20" type="button">Yes</button>
						<button id="confirmation-no" class="${btnClass} hover:border-red-500 hover:text-red-500 hover:bg-red-500/20" type="button">No</button>
					</div>
				</div>
			`);

			document.body.appendChild(confirmationDiv);

			const confirmBtn = document.getElementById('confirmation-yes');
			if (confirmBtn) {
				confirmBtn.addEventListener('click', () => {
					confirmationDiv.remove();
					resolve(true);
				});
			}

			const cancelBtn = document.getElementById('confirmation-no');
			if (cancelBtn) {
				cancelBtn.addEventListener('click', () => {
					confirmationDiv.remove();
					resolve(false);
				});
			}
		});
	}

	/**
	 * Block a user
	 */
	private async blockUser(userId: number): Promise<void> {
		const confirmation = await this.askConfirmation(userId, "block");
		if (!confirmation) return;

		try {
			const response = await http.post('/chat/block', { blocked_id: userId }, {});

			if (response.ok) {
				showNotification("User blocked", "info");
				this.loadFriends();
			} else {
				showNotification("Failed to block user", "error");
			}
		} catch (error) {
			console.error('Block error:', error);
			showNotification("Failed to block user", "error");
		}
	}

	/**
	 * Remove a friend
	 */
	private async removeFriend(friendId: number): Promise<void> {
		const confirmation = await this.askConfirmation(friendId, "remove");
		if (!confirmation) return;

		try {
			const response = await http.delete(`/chat/friends/${friendId}`, {});

			if (response.ok) {
				showNotification("Friend removed", "success");
				this.loadFriends();
			} else {
				showNotification("Failed to remove friend", "error");
			}
		} catch (error) {
			console.error('Remove friend error:', error);
			showNotification("Failed to remove friend", "error");
		}
	}

	private async unblockUser(userId: number): Promise<void> {
		const confirmation = await this.askConfirmation(userId, "unblock");
		if (!confirmation) return;

		try {
			const response = await http.delete(`/chat/block/${userId}`, {});

			if (response.status === 204) {
				showNotification("User successfully unblocked.", "success");
				this.loadBlockedUsers();
			}
			else
				showNotification("Failed to unblocked user.", "error");
		} catch (error) {
			console.error('Unblock user error:', error);
			showNotification("Failed to unblocked user.", "error");
		}
	}

	private async loadPendingInvites(): Promise<void> {
		try {
			const response = await http.get('/chat/friends/invites', {});

			const result = response.data.data as Record<string, FriendInvite>;
			this._invitesContainer.innerHTML = '';

			const pendingInvites = Object.entries(result);

			if (pendingInvites.length === 0) {
				this._invitesContainer.innerHTML = '<p class="text-white/70 text-lg">You do not have any pending friend invite.</p>';
			}
			else {
				for (const [userId, invite] of pendingInvites) {
					const username = await getUsernameByID(Number(userId));
					this._invitesContainer.appendChild(html`
						<div class="flex items-center space-x-1 m-1">
							<p class="flex-grow text-ellipsis">${username}</p>
							<button type="button" class="px-2 bg-green-500 hover:bg-green-600 rounded-l text-center transition cursor-pointer" data-acceptFriend="${invite.id}">
								Accept
							</button>
							<button type="button" class="px-2 bg-red-500 hover:bg-red-600 rounded-r text-center transition cursor-pointer" data-declineFriend="${invite.id}">
								Decline
							</button>
						</div>
					`);
				}
			}

			this._friendInvitesNotifications = pendingInvites.length;

			this._invitesContainer.querySelectorAll('button[data-acceptFriend]').forEach(btn => {
				btn.addEventListener('click', async (e) => {
					const id = Number((e.currentTarget as HTMLElement).getAttribute('data-acceptFriend'));
					showNotification("You accepted the friend request", "info");
					await this.respondToFriendInvite(id, true);
					this._friendInvitesNotifications--;
					this.loadPendingInvites();
					this.updateNotificationBadges();
				});
			});
			this._invitesContainer.querySelectorAll('button[data-declineFriend]').forEach(btn => {
				btn.addEventListener('click', async (e) => {
					const id = Number((e.currentTarget as HTMLElement).getAttribute('data-declineFriend'));
					showNotification("You declined the friend request", "info");
					await this.respondToFriendInvite(id, false);
					this._friendInvitesNotifications--;
					this.loadPendingInvites();
					this.updateNotificationBadges();
				});
			});

		} catch (error) {
			console.error("Load pending invites error:", error);
		}
	}

	private async respondToFriendInvite(id: number, value: boolean): Promise<boolean> {
		try {
			const response = await http.put(`chat/friends/${id}`, { pending: value }, {});

			return response.data;
		} catch (error) {
			console.error('Response to friend invite failed:', error);
			return false;
		}
	}

	/**
	 * Select a friend to chat with
	 */
	private selectFriend(friendId: number, username: string = `User ${friendId}`, picture?: string): void {
		this._selectedFriendId = friendId;

		this.switchTab(Tab.CHAT);

		this._chatNotifications.set(friendId, false);

		const chatHeader = this._chat.querySelector('#chat-friend-name');
		if (chatHeader) {
			chatHeader.innerHTML = '';
			chatHeader.appendChild(html`
				<div class="flex items-center gap-2 mb-1">
					${this._selectedFriendId !== 0 ? `<img src="${picture || Player.getIconPathBySkinId(0)}" class="rounded-full max-w-8" />` : ''}
					<p>Chat with ${username}</p>
                    <div class="status-dot w-2 h-2 rounded-full flex-shrink-0 ${this._friendStatuses.get(friendId) ? 'bg-green-500' : 'bg-red-500'}"></div>
				</div>
			`);
			// chatHeader.textContent = `Chat with ${username}`;
		}

		this._chatMessages.forEach((chatDiv) => {
			chatDiv.classList.add('hidden');
		});

		let chatDiv = this._chatMessages.get(friendId);

		if (!chatDiv) {
			chatDiv = document.createElement('div');
			chatDiv.className = this._chatMessagesClass;
			chatDiv.dataset.friendId = friendId.toString();
			this._chatMessagesContainer.appendChild(chatDiv);
			this._chatMessages.set(friendId, chatDiv);
		}

		chatDiv.classList.remove('hidden');
		chatDiv.scrollTop = chatDiv.scrollHeight;
		this._chatMessagesContainer.scrollTop = this._chatMessagesContainer.scrollHeight;

		this.updateActiveChats();
		this.updateNotificationBadges();
	}

	private async updateActiveChats(): Promise<void> {
		this._activeChats.innerHTML = '';
		this._chatMessages.forEach(async (chatDiv, key) => {
			if (key !== this._selectedFriendId) {
				let user: User | null = null;
				if (key !== 0)
					user = await getUserById(key);
				const username = key !== 0 ? (user?.username ?? `User ${key.toString()}`) : "System";
				let picture: string | undefined = undefined;
				if (user)
					picture = user.profilePicture || Player.getIconPathBySkinId(user.avatar);
				const btn = document.createElement('button');
				btn.className = "relative bg-black/20 rounded-lg hover:bg-black/40 items-center p-1 text-center text-lg overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer w-full overflow-visible";
				btn.id = `chat-${key}`;
				btn.innerText = username;
				addNotificationBadge(btn);
				if (this._chatNotifications.get(key))
					btn.querySelector('#notif-badge')?.classList.remove('hidden');
				btn.addEventListener('click', () => {
					this.selectFriend(key, username, picture);
				});
				this._activeChats.appendChild(btn);
			}
		});
	}

	private updateNotificationBadges(): void {
		let globalNotification: boolean = false;
		let chatCheck: boolean = false;

		this._chatNotifications.forEach((value, id) => {
			if (value) {
				globalNotification = true;
				if (!this._active || this._activeTab !== Tab.CHAT || this._selectedFriendId !== id) {
					chatCheck = true;
					const btn = this._activeChats.querySelector(`#chat-${id}`);
					if (btn)
						btn.querySelector('#notif-badge')?.classList.remove('hidden');
				}
			}
			else {
				const btn = this._activeChats.querySelector(`#chat-${id}`);
				if (btn && !value)
					btn.querySelector('#notif-badge')?.classList.add('hidden');
			}
		});
		if (chatCheck)
			this._chatTitle.querySelector('#notif-badge')?.classList.remove('hidden');
		else
			this._chatTitle.querySelector('#notif-badge')?.classList.add('hidden');

		if (this._friendInvitesNotifications > 0) {
			globalNotification = true;
			this._friendsTitle.querySelector('#notif-badge')?.classList.remove('hidden');
			this._invitesTitle.querySelector('#notif-badge')?.classList.remove('hidden');
		}
		else {
			this._friendsTitle.querySelector('#notif-badge')?.classList.add('hidden');
			this._invitesTitle.querySelector('#notif-badge')?.classList.add('hidden');
		}

		if (globalNotification)
			this._title.querySelector('#notif-badge')?.classList.remove('hidden');
		else
			this._title.querySelector('#notif-badge')?.classList.add('hidden');
	}

	getWs(): WebSocket | null { return this._ws }

	/**
	 * Clean up WebSocket connection (called on logout)
	 */
	disconnect(): void {
		// console.log('[Chat] disconnect() called');
		this._wsDisconnectedByServer = true; // Prevent auto-reconnect
		if (this._ws) {
			this._wsDisconnectedByServer = true;
			this._ws.close();
			this._ws = null;
		}
		this._userId = null;
		this._chatMessages.forEach((chatDiv) => {
			this._chatMessagesContainer.removeChild(chatDiv);
		});
		this._chatMessages.clear();
		this.updateActiveChats();
	}
}
