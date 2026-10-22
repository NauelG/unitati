import type { Component } from 'svelte';
import type { SpaceIcon } from '#lib/domain/knowledge.js';
import BookIcon from '@lucide/svelte/icons/book';
import BookOpenIcon from '@lucide/svelte/icons/book-open';
import LifeBuoyIcon from '@lucide/svelte/icons/life-buoy';
import WrenchIcon from '@lucide/svelte/icons/wrench';
import LaptopIcon from '@lucide/svelte/icons/laptop';
import ServerIcon from '@lucide/svelte/icons/server';
import ShieldIcon from '@lucide/svelte/icons/shield';
import KeyIcon from '@lucide/svelte/icons/key';
import UsersIcon from '@lucide/svelte/icons/users';
import BuildingIcon from '@lucide/svelte/icons/building';
import PrinterIcon from '@lucide/svelte/icons/printer';
import WifiIcon from '@lucide/svelte/icons/wifi';
import MailIcon from '@lucide/svelte/icons/mail';
import PhoneIcon from '@lucide/svelte/icons/phone';
import FolderIcon from '@lucide/svelte/icons/folder';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap';
import RocketIcon from '@lucide/svelte/icons/rocket';
import SettingsIcon from '@lucide/svelte/icons/settings';
import ScaleIcon from '@lucide/svelte/icons/scale';
import HeartHandshakeIcon from '@lucide/svelte/icons/heart-handshake';
import MegaphoneIcon from '@lucide/svelte/icons/megaphone';
import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list';
import LightbulbIcon from '@lucide/svelte/icons/lightbulb';

/**
 * The lucide component behind each key of `SPACE_ICONS`. Imported one by one, not
 * through the barrel, so a page that shows a space ships these 24 icons and not
 * the whole set. `Record<SpaceIcon, …>` makes a key added to the closed set
 * without an icon here a compile error.
 */
export const SPACE_ICON_COMPONENTS: Record<SpaceIcon, Component<{ class?: string }>> = {
	book: BookIcon,
	'book-open': BookOpenIcon,
	'life-buoy': LifeBuoyIcon,
	wrench: WrenchIcon,
	laptop: LaptopIcon,
	server: ServerIcon,
	shield: ShieldIcon,
	key: KeyIcon,
	users: UsersIcon,
	building: BuildingIcon,
	printer: PrinterIcon,
	wifi: WifiIcon,
	mail: MailIcon,
	phone: PhoneIcon,
	folder: FolderIcon,
	'file-text': FileTextIcon,
	'graduation-cap': GraduationCapIcon,
	rocket: RocketIcon,
	settings: SettingsIcon,
	scale: ScaleIcon,
	'heart-handshake': HeartHandshakeIcon,
	megaphone: MegaphoneIcon,
	'clipboard-list': ClipboardListIcon,
	lightbulb: LightbulbIcon
};
