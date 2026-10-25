/** The people a picker offers: active ones, reduced to what a `<select>` needs. */
export function activePeople(people: readonly { id: string; fullName: string; active: boolean }[]) {
	return people.filter((person) => person.active).map(({ id, fullName }) => ({ id, fullName }));
}
