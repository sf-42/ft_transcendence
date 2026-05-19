import Toastify from 'toastify-js';
import { clientWs, navigateTo, player, socialOverlay } from '../main';
import { Tab, FriendTab } from '../Social';
import { Game } from '../classes/Game';
import { getCurrentTournament } from './usersManagement';

export function showNotification(message: string, type: 'success' | 'error' | 'info' = 'info', action: '' | 'friendInvite' | 'chat' = '', id?: number): void {
	const colors = {
		success: 'rgb(34 197 94)',
		error: 'rgb(239 68 68)',
		info: 'rgb(14 155 233)'
	};

	Toastify({
		text: message,
		className: `font-jersey text-white text-xl xl:text-3xl !rounded-2xl shadow-lg`,
		duration: 3000,
		gravity: "top",
		position: "right",
		stopOnFocus: true,
		offset: {
			y: 75
		},
		style: {
			background: colors[type],
			padding: "1rem"
		},
		onClick: () => {
			if (action === '')
				return;
			else if (action === 'friendInvite') {
				socialOverlay.openOverlay(Tab.FRIENDS, FriendTab.INVITES);
			}
			else if (action === 'chat') {
				if (id)
					socialOverlay.openChat(id);
				else
					socialOverlay.openChat();
			}
		}
	}).showToast();
}

export async function showInviteNotification(message: string, type: 'friend-request' | 'chat' | 'game-invite' | 'tournament-invite', id?: number) {
	if (type === 'game-invite' || type === 'tournament-invite')
		return handleGameAndTournamentInviteNotification(message, type, id);

	Toastify({
		text: message,
		className: `font-jersey text-white text-xl xl:text-3xl !rounded-2xl shadow-lg`,
		duration: 3000,
		gravity: "top",
		position: "right",
		stopOnFocus: true,
		offset: {
			y: 75
		},
		style: {
			background: 'rgb(14 155 233)',
			padding: "1rem"
		},
		onClick: () => {
			switch (type) {
				case 'friend-request':
					socialOverlay.openOverlay(Tab.FRIENDS, FriendTab.INVITES);
					break;
				case 'chat':
					if (id)
						socialOverlay.openChat(id);
					else
						socialOverlay.openChat();
					break;
			}
		}
	}).showToast();
}

function handleGameAndTournamentInviteNotification(message: string, type: 'game-invite' | 'tournament-invite', id?: number) {
	if (id === undefined)
		return;

	const toastContent = document.createElement('div');
	toastContent.className = 'flex gap-2 items-center';

	const messageElem = document.createElement('div');
	messageElem.textContent = message;
	// messageElem.className = '';

	const buttonContainer = document.createElement('div');
	buttonContainer.className = 'flex flex-col';

	const acceptBtn = document.createElement('button');
	acceptBtn.textContent = 'Accept';
	acceptBtn.className = 'px-3 py-1 bg-white/10 hover:bg-white/20 rounded-t text-md xl:text-xl transition cursor-pointer';
	acceptBtn.onclick = (e) => {
		e.stopPropagation();
		if (type === 'game-invite')
			handleGameInviteAccept(id);
		else
			handleTournamentInviteAccept(id);
		const toast = acceptBtn.closest('.toastify');
		if (toast)
			toast.remove();
	};

	const declineBtn = document.createElement('button');
	declineBtn.textContent = 'Decline';
	declineBtn.className = 'px-3 py-1 bg-white/10 hover:bg-white/20 rounded-b text-md xl:text-xl transition cursor-pointer';
	declineBtn.onclick = (e) => {
		e.stopPropagation();
		// if (type === 'game-invite')
		// 	handleGameInviteDecline(id);
		// else
		// 	handleTournamentInviteDecline(id);
		const toast = acceptBtn.closest('.toastify');
		if (toast)
			toast.remove();
	};

	buttonContainer.appendChild(acceptBtn);
	buttonContainer.appendChild(declineBtn);
	toastContent.appendChild(messageElem);
	toastContent.appendChild(buttonContainer);

	Toastify({
		node: toastContent,
		className: `font-jersey text-white text-xl xl:text-3xl !rounded-2xl shadow-lg`,
		duration: 10000,
		gravity: "top",
		position: "right",
		stopOnFocus: true,
		offset: {
			y: 75
		},
		style: {
			background: 'rgb(14 155 233)',
			padding: "1rem"
		},
		onClick: () => {}
	}).showToast();
}

export async function handleGameInviteAccept(id: number) {
	Game.joinRoom(id);
}

// async function handleGameInviteDecline(id: number) {

// }

export async function handleTournamentInviteAccept(id: number) {
	if (player && clientWs) {
		if (await getCurrentTournament()) {
			showNotification('You already are in a tournament.', 'error');
			return;
		}
		clientWs.requestTournamentJoin(id, player.getAccountID());
		try {
			await clientWs.waitTournamentJoin();
			navigateTo("/tournament-overview");
		} catch (error) {
			showNotification('Tournament join timed out', 'error');
		}
	}
	else
		console.error("No player or web socket set.");
}

// async function handleTournamentInviteDecline(id: number) {

// }