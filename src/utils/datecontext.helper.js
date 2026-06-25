
export function getDateContext() {


    const now = new Date();

    const today = now.toISOString().split("T")[0];

    const currentYear = now.getFullYear();


    // Last week calculation
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 7);

    const lastWeekEnd = new Date(now);
    lastWeekEnd.setDate(now.getDate() - 1);


    return `
REAL TIME DATE CONTEXT:

Today:
${today}

Current Year:
${currentYear}


DATE RESOLUTION RULES:

1. If user says:
- tomorrow
- today
- next week
- next Monday
- next month

calculate date based on Today's date above.


2. If user asks:
"show campaigns scheduled last week"

convert it to:

Start Date:
${lastWeekStart.toISOString().split("T")[0]}

End Date:
${lastWeekEnd.toISOString().split("T")[0]}


3. Never create dates from old conversation history.
4. Always use YYYY-MM-DD format for scheduling.
5. Future scheduling must not create past dates.
`;

}
