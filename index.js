import {Client} from 'relay-to-relay'
import {Dexie} from 'dexie'
import {EventEmitter} from 'events'

export default class Base extends EventEmitter {
    constructor(opts){
        super()
        this._debug = opts.debug
        this._user = localStorage.getItem('user') || (() => {const test = crypto.randomUUID();localStorage.setItem('user', test);return test;})()
        this._timer = opts.timer || 180000
        this._only = opts.only || null
        this._ban = opts.ban || null
        this.client = new Client(opts.url, opts.hash, opts.rtor)
        this._ids = new Map()
        this._users = new Map()

        this._message = (data, nick) => {
            try {
                if(this._debug){
                    console.log('Received Message: ', typeof(data), data)
                }
    
                const datas = JSON.parse(data)

                if(this._only && !this._only.has(datas.id)){
                    return
                }

                if(this._ban && this._ban.has(datas.id)){
                    return
                }

                if(this._ids.has(datas.id)){
                    const mainObj = this._ids.get(datas.id)
                    const obj = mainObj.get(datas.user)
                    if(obj){
                        if(obj.stamp < datas.stamp){
                            obj.stamp = datas.stamp
                            if(datas.segment){
                                if(obj.segment < datas.segment){
                                    obj.segment = datas.segment
                                    this.emit('media', datas)
                                }
                            }
                            if(datas.state){
                                if(obj.state !== datas.state){
                                    obj.state = datas.state
                                    this.emit('media', datas)
                                }
                            }
                            // this.emit('media', datas)
                            this.client.onMesh(datas, nick)
                        }
                    } else {
                        mainObj.set(datas.user, {segment: datas.segment, stamp: datas.stamp, state: datas.state})
                        this.emit('media', datas)
                        this.client.onMesh(datas, nick)
                    }
                } else if(this._users.has(datas.id)){
                    const mainObj = this._users.get(datas.id)
                    const obj = mainObj.get(datas.user)
                    if(obj){
                        if(obj.stamp < datas.stamp){
                            obj.stamp = datas.stamp
                            if(datas.segment){
                                if(obj.segment < datas.segment){
                                    obj.segment = datas.segment
                                }
                            }
                            if(datas.state){
                                if(obj.state !== datas.state){
                                    obj.state = datas.state
                                }
                            }
                            this.client.onMesh(datas, nick)
                        }
                    } else {
                        mainObj.set(datas.user, {segment: datas.segment, stamp: datas.stamp, state: datas.state})
                        this.client.onMesh(datas, nick)
                    }
                } else {
                    this._users.set(datas.id, new Map([[datas.user, {segment: datas.segment, stamp: datas.stamp}]]))
                    this.client.onMesh(datas, nick)
                }
            } catch (err) {
                if(this._debug){
                    console.error(err)
                }
                return
            }
        }
        this._disconnect = (chan) => {
            console.log('disconnected: ' + chan)
        }
        this._err = (e, chan) => {
            console.error(e, chan)
        }
        this._connect = (chan) => {
            console.log('connected: ' + chan)
        }

        this.client.on('connect', this._connect)
        this.client.on('error', this._err)
        this.client.on('disconnect', this._disconnect)
        this.client.on('message', this._message)

        this._routine = setInterval(() => {
            for(const [k, v] of this._ids.entries()){
                for(const [prop, data] of v.entries()){
                    if(Date.now() > (data.stamp + 300000)){
                        this.emit('expire', {id: k, user: prop})
                        v.delete(prop)
                    }
                }
            }
            for(const [k, v] of this._users.entries()){
                for(const [prop, data] in v.entries()){
                    if(Date.now() > (data.stamp + 300000)){
                        v.delete(prop)
                    }
                }
                if(!v.size){
                    this._users.delete(k)
                }
            }
        }, this._timer)
    }

    add(id){
        if(!this._ids.has(id)){
            this._ids.set(id, new Map())
        }
    }
    start(id, kind, mime){
        this.client.onSend(JSON.stringify({id, kind, user: this._user, state: 'start', mime}))
    }
    play(id, kind, mime){
        this.client.onSend(JSON.stringify({id, kind, user: this._user, state: 'play', mime}))
    }
    pause(id, kind, mime){
        this.client.onSend(JSON.stringify({id, kind, user: this._user, state: 'pause', mime}))
    }
    stop(id, kind, mime){
        this.client.onSend(JSON.stringify({id, kind, user: this._user, state: 'stop', mime}))
    }
    async data(id, kind, mime, segment, data){
        this.client.onSend(JSON.stringify({id, kind, user: this._user, data: await data.text(), segment, stamp: Date.now(), mime}))
    }
    sub(id){
        if(this._ids.has(id)){
            const obj = this._ids.get(id)
            for(const prop of obj.keys()){
                this.emit('expire', {id, user: prop})
                obj.delete(prop)
            }
            obj.clear()
            this._ids.delete(id)
        }
    }

    quit(){
        clearInterval(this._routine)
        this._ids.clear()
        this._users.clear()
        this.client.off('connect', this._connect)
        this.client.off('error', this._err)
        this.client.off('message', this._message)
        this.client.off('disconnect', this._disconnect)
        this.client.end()
    }
}