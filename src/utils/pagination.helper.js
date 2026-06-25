export function handlePagination(
    history,
    session,
    module
) {

    const lastMessage =
        history[history.length - 1]
        ?.content
        ?.toLowerCase()
        ?.trim();


    if(!lastMessage)
        return;

    const offsetKey = `${module}Offset`;
    const fetchKey = `${module}FetchNext`;


    // check session values exist
    if(
        session[offsetKey] === undefined ||
        session[fetchKey] === undefined
    )
    {
        return;
    }

    // NEXT PAGE
    if(
        /(next|more|show more)/i.test(lastMessage)
    )
    {
        session[offsetKey] += session[fetchKey];
    }

    // PREVIOUS PAGE
    if(
        /(previous|back|show previous)/i.test(lastMessage)
    )
    {
        session[offsetKey] -= session[fetchKey];
        if(session[offsetKey] < 0)
        {
            session[offsetKey] = 0;
        }
    }

}