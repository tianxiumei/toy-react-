const RENDER_TO_DOM = Symbol('render to dom')

export abstract class Component {
    props = Object.create(null)
    children: (Component | ElementWrapper | TextWrapper)[] = []
    _root: null = null
    state: any = null
    _range: Range
    _vdom: any
    abstract render(): Component | ElementWrapper | TextWrapper
    constructor() {
        this._range = null
    }
    setAttribute(name, value) {
        this.props[name] = value
    }
    get vdom() {
        return this.render().vdom
    }
    appendChild(component) {
        this.children.push(component)
    }
    [RENDER_TO_DOM](range: Range) {
        this._range = range
        this._vdom = this.vdom
        this._vdom[RENDER_TO_DOM](range)
    }
    update() {
        let isSame = (oldNode, newNode) => {
            if (oldNode.type !== newNode.type) {
                return false
            }
            for (const name in newNode.props) {
                if (newNode.props[name] !== oldNode.props[name]) {
                    return false
                }
            }
            if (oldNode.props.length !== newNode.props.length) {
                return false
            }
            if (newNode.type === '#text') {
                if (newNode.content !== oldNode.content) {
                    return false
                }
            }
            return true
        }
        let update = (oldNode, newNode) => {
            //type,props,childredn
            // text content
            if (!isSame(oldNode, newNode)) {
                newNode[RENDER_TO_DOM](oldNode._range)
                return
            }
            newNode._range = oldNode._range

            let newchildren = newNode.vchildren
            let oldhildren = oldNode.vchildren

            if (!newchildren || !oldhildren) {
                return
            }
            let tailRange = oldhildren[oldhildren.length - 1]._range as Range

            for (let i = 0; i < newchildren.length; i++) {
                let newchild = newchildren[i]
                let oldchild = oldhildren[i]
                if (i < oldhildren.length) {
                    update(oldchild, newchild)
                } else {
                    let range = document.createRange()
                    range.setStart(tailRange.endContainer, tailRange.endOffset)
                    range.setEnd(tailRange.endContainer, tailRange.endOffset)
                    newchild[RENDER_TO_DOM](range)
                    tailRange = range
                }
            }
        }
        let vdom = this.vdom
        update(this._vdom, vdom)
        this._vdom = vdom
    }
    setState(newState) {
        this.state = Object.assign({}, this.state || {}, newState)
        if (this.state === null || typeof this.state !== 'object') {
            this.state = newState
            this.update()
            return
        }
        let merge = (oldState, newState) => {
            if (!newState) {
                return
            }
            for (let p in oldState) {
                if ((oldState[p] === null || typeof oldState[p] !== 'object')) {
                    oldState[p] = newState[p]
                } else {
                    merge(oldState[p], newState[p])
                }
            }
        }
        merge(this.state, newState)
        this.update()
    }
}

class FuncComponent extends Component {
    func: (attrs: { [key: string]: any }) => Component
    constructor(func: () => Component) {
        super()
        this.func = func
    }
    render() {
        return this.func({ ...this.props, children: this.children })
    }
}


function replaceContent(range: Range, node: Node) {
    range.insertNode(node)
    range.setStartAfter(node)
    range.deleteContents()
    range.setStartBefore(node)
    range.setEndAfter(node)
}

export function createElement(type, attrs, ...children) {
    let element: Component | ElementWrapper
    if (typeof type === 'string') {
        element = new ElementWrapper(type)
    } else if (type.prototype instanceof Component) {
        element = new (type as new () => Component)
    } else {
        element = new FuncComponent(type as (() => Component))
    }
    for (let attr in attrs) {
        element.setAttribute(attr, attrs[attr])
    }
    const insertChild = (children: (Component | TextWrapper | string | number | null)[]) => {
        for (let child of children) {
            if (child === null) {
                continue
            }
            if (typeof child === 'string' || typeof child === 'number') {
                child = new TextWrapper(child.toString())
            }
            if (Array.isArray(child)) {
                insertChild(child)
            } else {
                element.appendChild(child)
            }
        }
    }
    insertChild(children)
    return element
}


class ElementWrapper extends Component {
    _range: Range
    type: any
    vchildren: any
    constructor(type) {
        super()
        this._range = null
        this.type = type
    }
    render() {
        return this
    }
    get vdom() {
        this.vchildren = this.children.map((child) => child.vdom)
        return this
    }
    [RENDER_TO_DOM](range: Range) {
        this._range = range
        let root = document.createElement(this.type)
        for (const name in this.props) {
            let value = this.props[name]
            if ((name.match(/^on([\s\S]+)/))) {
                root.addEventListener('click', value)
            } else {
                if (name === 'className') {
                    root.setAttribute('class', value)
                }
                root.setAttribute(name, value)
            }
        }
        if (!this.vchildren) {
            this.vchildren = this.children.map((child) => child.vdom)
        }
        for (let child of this.vchildren) {
            let childRange = document.createRange()
            childRange.setStart(root, root.childNodes.length)
            childRange.setEnd(root, root.childNodes.length)
            childRange.deleteContents()
            child[RENDER_TO_DOM](childRange)
        }
        replaceContent(range, root)
    }
}

class TextWrapper extends Component {
    root: Text
    _range: Range
    content: any
    type = '#text'
    constructor(content) {
        super()
        this._range = null
        this.content = content
    }
    render() {
        return this
    }
    [RENDER_TO_DOM](range: Range) {
        this._range = range
        const root = document.createTextNode(this.content)
        replaceContent(range, root)
    }
    rerender() {
        this._range.deleteContents()
        this[RENDER_TO_DOM](this._range)
    }
    get vdom() {
        return this
    }
}

export function render(component: Component | TextWrapper | ElementWrapper, parentElement: HTMLElement) {
    let range = document.createRange()
    range.setStart(parentElement, 0)
    range.setEnd(parentElement, parentElement.childNodes.length)
    range.deleteContents()
    component[RENDER_TO_DOM](range)
}

