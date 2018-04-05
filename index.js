'use strict';

(function (angular) {
    var app = angular.module('ngRoute');
    app.requires.push('oc.lazyLoad');
    /**
     * 从模版中解析出script外链脚本
     * @return tpl:处理后的模版字符串 scripts:提取出来的脚本链接, 数据结构: [['a.js','b.js'], ['c.js']]
     */
    function processTpl (tpl) {
        var SCRIPT_TAG_REGEX = /<(script)\s+((?!type=('|")text\/ng-template\3).)*?>.*?<\/\1>/gi;
        var SCRIPT_SRC_REGEX = /.*\ssrc=("|')(\S+)\1.*/;
        var scripts = [];

        // 处理模版,将script抽取出来
        var t = tpl.replace(SCRIPT_TAG_REGEX, function (match) {
            var matchedScriptSrc = match.match(SCRIPT_SRC_REGEX);

            scripts = scripts || [];

            if (matchedScriptSrc && matchedScriptSrc[2]) {
                scripts.push(matchedScriptSrc[2]);
            }

            return '<!-- script replaced -->';
        });

        return {
            tpl: t,
            scripts: scripts.filter(function (script) {
                // 过滤空的索引
                return Boolean(script);
            })
        };
    }
    app.decorator('ngViewDirective', ['$route', '$delegate', '$log', '$q', '$compile', '$controller', '$interpolate', '$ocLazyLoad',
        function ($route, $delegate, $log, $q, $compile, $controller, $interpolate, $ocLazyLoad) {
            $delegate[1].compile = function (tElement) {
                return function (scope, $element, attr, ctrl, $transclude) {
                    var current = $route.current;
                    var locals = current.locals;
                    var template = locals.$template;
                    var processResult = processTpl(template);
                    // 按脚本优先级加载脚本
                    var loadScripts = function (scripts) {
                        var promise = $ocLazyLoad.load(scripts.shift());
                        var errorHandle = function (err) {
                            $log.error(err);
                            return $q.reject(err);
                        };
                        var nextGroup;

                        while (scripts.length) {
                            nextGroup = scripts.shift();

                            promise = promise.then(function (next) {
                                return $ocLazyLoad.load(next);
                            }.bind(null, nextGroup));
                        }

                        return promise.catch(errorHandle);
                    };
                    var compileTemplate = function () {
                        $element.html(processResult.tpl);

                        var link = $compile($element.contents());
                        if (current.controller) {
                            locals.$scope = scope;
                            var controller = $controller(current.controller, locals);
                            if (current.controllerAs) {
                                scope[current.controllerAs] = controller;
                            }
                            $element.data('$ngControllerController', controller);
                            $element.children().data('$ngControllerController', controller);
                        }

                        link(scope);
                    };
                    // 模版中不含脚本则直接编译,否则在获取完脚本之后再做编译
                    if (processResult.scripts.length) {
                        loadScripts(processResult.scripts).then(compileTemplate);
                    } else {
                        compileTemplate();
                    }
                };
            };
            return $delegate;
        }
    ]);
})(angular);
